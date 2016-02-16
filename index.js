/*global require,module*/
"use strict";

const WebSocket = require("ws");
const EventEmitter = require("events");
const util = require("util");
const light = require("./light.js");

var Service, Characteristic, Types;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Types = homebridge.hapLegacyTypes;
    homebridge.registerPlatform("homebridge-homework", "homework", HWPlatform);
};

module.exports.platform = HWPlatform;

function Listener()
{
    EventEmitter.call(this);
    this.setMaxListeners(1000);
};

util.inherits(Listener, EventEmitter);

function HWPlatform(log, config) {
    this._log = log;
    this._config = config;
    this._host = config.host;
    this._port = config.port;
    this._listener = new Listener();
    this._state = {};
    this._id = 0;

    light.init(this, Service, Characteristic);

    this.reconnect();
}

// copied from homework
HWPlatform.Types = { Dimmer: 0, Light: 1, Fan: 2, Thermostat: 3, Unknown: 99 };

HWPlatform.prototype = {
    _log: undefined,
    _ws: undefined,
    _host: undefined,
    _port: undefined,
    _listener: undefined,
    _devices: undefined,
    _state: undefined,
    _id: 0,

    get listener() {
        return this._listener;
    },
    get ws() {
        return this._ws;
    },
    get log() {
        return this._log;
    },

    processDevices: function(cb) {
        var ret = [];
        for (var k in this._devices) {
            const dev = this._devices[k];
            switch (dev.type) {
            case HWPlatform.Types.Dimmer:
                ret.push(new light.Device(dev, true));
                break;
            case HWPlatform.Types.Light:
                ret.push(new light.Device(dev, false));
                break;
            default:
                this.log("unknown device", dev.type, dev.name);
                break;
            }
        }
        cb(ret);
    },

    reconnect: function reconnect() {
        this._ws = new WebSocket("ws://" + this._host + (this._port ? (":" + this._port) : "") + "/");
        this._ws.on("open", () => {
            this.log("requesting devices");
            this.request({ type: "devices" }).then((response) => {
                if (!(response instanceof Array))
                    return;
                var devs = Object.create(null);
                var rem = response.length;
                var done = () => {
                    this.log("got all devices");
                    this.updateDevices(devs);
                };
                for (var i = 0; i < response.length; ++i) {
                    let uuid = response[i].uuid;
                    devs[uuid] = response[i];
                    devs[uuid].values = Object.create(null);
                    this.request({ type: "values", devuuid: uuid }).then((response) => {
                        if (response instanceof Array) {
                            for (var i = 0; i < response.length; ++i) {
                                var val = response[i];
                                devs[uuid].values[val.name] = val;
                            }
                        }
                        if (!--rem)
                            done();
                    });
                }
                // return this.request({ type: "values", devuuid: response.uuid });
            }).catch((err) => {
                this.log("device error", err);
            });
        });
        this._ws.on("close", () => {
            this._listener.emit("close");
        });
        this._ws.on("message", (data, flags) => {
            try {
                var obj = JSON.parse(data);
            } catch (e) {
                this.log("invalid json received", data);
                return;
            }
            if (typeof obj === "object") {
                // value update
                if ("valueUpdated" in obj) {
                    if (obj.devuuid in this._devices) {
                        const dev = this._devices[obj.devuuid];
                        if (obj.valname in dev) {
                            const val = dev[obj.valname];
                            val.value = obj.value;
                            val.raw = obj.raw;
                            this._listener.emit("valueUpdated", val, dev);
                        } else {
                            this.log("value updated but value not known", obj.devuuid, obj.valname);
                        }
                    }
                } else if ("id" in obj) {
                    this._listener.emit("response", obj);
                } else {
                    this.log("unrecognized response", obj);
                }
            } else {
                this.log("non-object received", typeof obj);
            }
        });
    },
    updateDevices: function(devs) {
        this._devices = devs;
        if (this._state.accessoriesCb) {
            this.processDevices(this._state.accessoriesCb);
            delete this._state.accessoriesCb;
        }
    },
    accessories: function(cb) {
        this.log("getting accessories", this._devices);
        if (this._devices !== undefined) {
            this.processDevices(cb);
        } else {
            this._state.accessoriesCb = cb;
        }
    },
    request: function(req) {
        const p = new Promise((resolve, reject) => {
            let id = ++this._id;
            req.id = id;
            // this.log("sending req", JSON.stringify(req));
            this.listener.on("response", (resp) => {
                if ("id" in resp && "result" in resp && resp.id == id) {
                    resolve(resp.result);
                }
            });
            this.listener.on("close", () => {
                reject("connection closed");
            });
            this.ws.send(JSON.stringify(req));
        });
        return p;
    }
};
