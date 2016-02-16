/*global module*/

var homework, Service, Characteristic;

function HomeworkLight(dev, dimmable) {
    this.device = dev;
    this.dimmable = dimmable;
    this.primary = dimmable ? dev.values["level"] : dev.values["value"];
    this.name = dev.name;

    homework.listener.on("valueUpdated", (val, dev) => {
        if (dev.uuid !== this.device.uuid)
            return;
        // blah
    });
}

HomeworkLight.prototype = {
    log: undefined,
    request: undefined,

    get raw() {
        return parseInt(this.primary.raw);
    },

    setValue: function(val)
    {
        return homework.request({ type: "setValue", devuuid: this.device.uuid, valname: this.primary.name, val });
    },

    _getOn: function(callback) {
        this.log("geton " + this.name);
        this.log(this.primary.value, this.raw);
        callback(null, this.raw > 0);
    },
    _setOn: function(on, callback) {
        if (on && this.raw > 0) {
            callback();
            return;
        }
        if (!on && this.raw === 0) {
            callback();
            return;
        }
        this.log("seton " + on + " " + this.name);
        this.setValue(on ? "on" : "off").then(() => {
            callback();
        });
    },
    _getDim: function(callback) {
        this.log("getdim " + this.name);
        this.log(this.raw);
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
        this.log("setdim " + val + " " + this.name);
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
        info.setCharacteristic(Characteristic.SerialNumber, this.address);

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
    },
    update: function(addr, val) {
        this.device.value = val;
        this.lightService.setCharacteristic(Characteristic.On, val.value > 0);
        this.lightService.setCharacteristic(Characteristic.Brightness, val.value);
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
