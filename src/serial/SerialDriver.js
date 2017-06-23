(function(exports) {
    const SerialPort = require('serialport');
    const winston = require('winston');

    class SerialDriver {
        constructor(options={}) {
            this.serialTimeout = options.serialTimeout || 30000;
            this.onRequestData = null;
            this.state = {
                serialPath: '(no device)',
            };
        }

        static discover(filter = SerialDriver.defaultFilter()) {
            filter = filter || {
                manufacturer: /./
            };
            return new Promise((resolve, reject) => {
                let async = function*() {
                    try {
                        var ports = yield SerialPort.list(
                            (err, ports) => err ? async.throw(err) : async.next(ports));
                        ports = ports.filter(p => SerialDriver.matchesPort(filter, p));
                        resolve(ports);
                    } catch (err) {
                        reject(err);
                    }
                }();
                async.next();
            });
        }

        static matchesPort(filter, port) {
            return filter == null || Object.keys(filter).reduce((acc, key) => {
                if (acc) {
                    var value = port[key];
                    var selector = filter[key];
                    if (selector == null) {
                        return value == null;
                    }
                    if (selector instanceof RegExp) {
                        return value != null && selector.test(value);
                    }
                    return selector === value;
                }
                return false;
            }, true);
        }

        static defaultFilter() {
            return {
                manufacturer: /./, // provided by connected USB serial 
            };
        }

        static serialPortOptions(options = {}) {
            return Object.assign({
                parser: SerialPort.parsers.readline('\n'),
                lock: true,
                baudRate: 9600,
                dataBits: 8,
                stopBits: 1,
                rtscts: false,
                xon: false,
                xoff: false,
                xany: false,
                bufferSize: 65536,
                autoOpen: false,
            }, options);
        }

        get logPrefix() {
            return this.constructor.name + " " + (this.serialPort ? this.serialPort.path : '(no serialPort)');
        }

        open(filter = SerialDriver.defaultFilter(), options = SerialDriver.serialPortOptions()) {
            var that = this;
            return new Promise((resolve, reject) => {
                let async = function*() {
                    try {
                        var ports = yield SerialDriver.discover(filter)
                            .then(ports => async.next(ports))
                            .catch(err => async.throw(err));
                        if (!ports.length) {
                            throw new Error(that.logPrefix + " found no ports to open()");
                        }
                        winston.debug(that.logPrefix + " open() discovered", ports.length,
                            ports.length ? "ports:" + ports.map(p => p.comName) : "ports");
                        var port = ports[0];
                        winston.debug("SerialDriver", port.comName, "SerialPort.open()...");
                        var sp = that.serialPort = new SerialPort(port.comName, options);
                        sp.on('data', (data) => {
                            winston.warn("onRequestData", data);
                            var onRequestData = that.onRequestData;
                            if (onRequestData) {
                                that.onRequestData = null;
                                onRequestData(data);
                            }
                        });
                        yield sp.open((err) => err ? async.throw(err) : async.next(true));
                        winston.info("SerialDriver", port.comName,
                            "SerialPort.open()", sp.isOpen() ? "OK" : "FAILED");
                        that.state.serialPath = port.comName;
                        resolve(sp);
                    } catch (err) {
                        reject(err);
                    }
                }(); // async
                async.next();
            });
        }

        isOpen() {
            return this.serialPort && this.serialPort.isOpen() || false;
        }

        close() {
            var that = this;
            return new Promise((resolve, reject) => {
                if (this.isOpen()) {
                    winston.info(that.logPrefix, "SerialPort.close()");
                    this.serialPort.close(err => err ? reject(err) : resolve());
                } else {
                    reject(new Error("SerialDriver.close() no opened port"));
                }
            });
        }

        write(request, msTimeout=this.serialTimeout) {
            var that = this;
            if (!typeof request === "string") {
                return Promise.reject(new Error(that.logPrefix + " write() expected String request:" + request));
            }
            return new Promise((resolve, reject) => {
                try {
                    var sp = that.serialPort;
                    if (that.onRequestData) {
                        throw new Error("serial request already in progress");
                    }
                    if (!sp.isOpen()) {
                        throw new Error("is not open for write()");
                    }
                    if (sp == null) {
                        throw new Error("has no SerialPort");
                    }
                    if (!sp.isOpen()) {
                        throw new Error("is not open");
                    }
                    winston.info(that.logPrefix, "write()", request.trim());
                    sp.write(request);
                    var eTimeout = new Error(that.logPrefix + " write() response timeout:" + msTimeout);
                    sp.drain((err) => {
                        if (err) {
                            winston.error(that.logPrefix, "drain()", err);
                            throw err;
                        }
                        resolve(this);
                        /*
                        that.onRequestData = (data) => resolve(data);
                        setTimeout(() => {
                            if (that.onRequestData) {
                                winston.error(eTimeout);
                                reject(eTimeout);
                            }
                        }, msTimeout);
                        */
                    });
                } catch (err) {
                    winston.error(that.logPrefix, "write()", err);
                    reject(err);
                }
            });
        }

        homeRequest(axes = []) {
            var request = "G28.1";
            return request;
        }

        home(axes = []) {
            try {
                return this.write(this.homeRequest(axes));
            } catch (err) {
                return Promise.reject(err);
            }
        }

        moveToRequest(axes = []) {
            if (axes.length === 0) {
                throw new Error("moveTo() requires at least one axis destination");
            }
            var coord = "XYZABCDEF";
            if (axes.length > coord.length) {
                throw new Error("moveTo() axis out of bounds:" + axes);
            }
            var request = "G1";
            axes.forEach((a, i) => {
                var c = coord[i];
                if (a != null) {
                    request += " " + c + Number(a);
                }
            });
            return request;
        }

        moveTo(axes = []) {
            try {
                return this.write(this.moveToRequest(axes));
            } catch (err) {
                return Promise.reject(err);
            }
        }

    } // class SerialDriver

    module.exports = exports.SerialDriver = SerialDriver;
})(typeof exports === "object" ? exports : (exports = {}));
