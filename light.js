/*global module*/

var homework, Service, Characteristic;

function rawValue(val)
{
    switch (typeof val) {
    case "string":
        return parseInt(val);
    case "boolean":
        return val ? 1 : 0;
    }
    return val;
}

function HomeworkLight(dev, dimmable) {
    this.device = dev;
    this.dimmable = dimmable;
    this.primary = dimmable ? dev.values["level"] : dev.values["value"];
    this.name = dev.name;
    this.log = homework.log;
    this._max = dimmable ? 99 : 1;

    homework.listener.on("valueUpdated", (val, old, dev) => {
        if (dev.uuid !== this.device.uuid)
            return;
        if ((rawValue(old.raw) > 0) !== (this.raw > 0)) {
            this.lightService.setCharacteristic(Characteristic.On, this.raw > 0);
        }
        if (this.dimmable) {
            if (rawValue(old.raw) !== this.raw) {
                this.lightService.setCharacteristic(Characteristic.Brightness, this.raw);
            }
        }
    });
}

HomeworkLight.prototype = {
    log: undefined,
    request: undefined,

    get raw() {
        return rawValue(this.primary.raw);
    },

    setValue: function(val)
    {
        return homework.request({ type: "setValue", devuuid: this.device.uuid, valname: this.primary.name, value: val });
    },

    _getOn: function(callback) {
        // this.log("geton", this.name);
        // this.log(this.primary.value, this.raw);
        callback(null, this.raw > 0);
    },
    _setOn: function(on, callback) {
        if (on && this.raw == this._max) {
            callback();
            return;
        }
        if (!on && this.raw === 0) {
            callback();
            return;
        }
        // this.log("seton " + on + " " + this.name);
        this.setValue(on ? "on" : "off").then(() => {
            callback();
        });
    },
    _getDim: function(callback) {
        // this.log("getdim " + this.name);
        // this.log(this.raw);
        callback(null, this.raw);
    },
    _setDim: function(level, callback) {
        var val = level;
        if (val > 99)
            val = 99;
        if (this.raw == val) {
            callback();
            return;
        }
        // this.log("setdim " + val + " " + this.name);
        this.setValue(val).then(() => {
            callback();
        });
    },
    identify: function(callback) {
        callback();
    },
    getServices: function() {
        var info = new Service.AccessoryInformation();
        info.setCharacteristic(Characteristic.Manufacturer, "Homework");
        info.setCharacteristic(Characteristic.Model, this.name);
        info.setCharacteristic(Characteristic.SerialNumber, this.device.uuid);

        var light = new Service.Lightbulb();
        light.getCharacteristic(Characteristic.On).on("set", this._setOn.bind(this));
        light.getCharacteristic(Characteristic.On).on("get", this._getOn.bind(this));
        if (this.dimmable) {
            light.addCharacteristic(Characteristic.Brightness).on("set", this._setDim.bind(this));
            light.getCharacteristic(Characteristic.Brightness).on("get", this._getDim.bind(this));
        }

        this.informationService = info;
        this.lightService = light;

        return [info, light];
    }
};

module.exports = {
    Device: HomeworkLight,
    init: function(hw, service, characteristic) {
        homework = hw;
        Service = service;
        Characteristic = characteristic;
    }
};
