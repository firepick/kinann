(function(exports) {
    const SerialPort = require('serialport');
    const winston = require('winston');

    class SerialDriver {
        constructor() {
            this.state = {
                serialPath: null,
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

        open(filter = SerialDriver.defaultFilter(), options = SerialDriver.serialPortOptions()) {
            var that = this;
            return new Promise((resolve, reject) => {
                let async = function*() {
                    function asyncPromise(p) { p.then(r=>async.next(r)).catch(e=>async.throw(e)); }
                    try {
                        var ports = yield SerialDriver.discover(filter)
                            .then(ports => async.next(ports))
                            .catch(err => async.throw(err));
                        if (!ports.length) {
                            throw new Error(that.constructor.name + " found no ports to open()");
                        }
                        winston.debug(that.constructor.name + " open() discovered", ports.length, 
                            ports.length ? "ports:" + ports.map(p=>p.comName) : "ports");
                        var port = ports[0];
                        winston.debug("SerialDriver", port.comName, "SerialPort.open()...");
                        var sp = that.serialPort = new SerialPort(port.comName, options);
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
                    winston.info(that.constructor.name, that.state.serialPath, "SerialPort.close()");
                    this.serialPort.close(err => err ? reject(err) : resolve());
                } else {
                    reject(new Error("SerialDriver.close() no opened port"));
                }
            });
        }

        write(request) {
            return new Promise((resolve, reject) => {
                try {
                    var sp = this.serialPort;
                    if (sp == null) {
                        throw(new Error(this.constructor.name + " has no SerialPort"));
                    }
                    if (!sp.isOpen()) {
                        throw(new Error(this.constructor.name + " is not open"));
                    }
                    sp.write(request);
                    sp.drain((err) => {
                        if (err) {
                            throw err;
                        }
                        resolve(this);
                    });
                } catch (err) {
                    reject(err);
                }
            });
        }

        homeRequest(axes = []) {
            var request = "G28.1";
            return request;
        }

        home(axes = []) {
            return this.write(homeRequest(axes));
        }

    } // class SerialDriver

    module.exports = exports.SerialDriver = SerialDriver;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("SerialDriver", function() {
    const should = require("should");
    const winston = require('winston');
    const SerialPort = require('serialport');
    const SerialDriver = exports.SerialDriver || require("../src/serial/SerialDriver");
    winston.level = "warn";

    it("discover(filter) returns filtered list of serial ports", function(done) {
        let async = function*() {
            var ports = yield SerialDriver.discover().then(ports => async.next(ports));
            winston.debug("discover() ", ports.length, "ports:", ports.map(p=>p.comName));
            if (ports.length) {
                ports.forEach((p, i) =>
                    console.log(`PORT#${i+1} ${p.comName} manufacturer:${p.manufacturer}`));
            } else {
                console.log("SerialDriver detected no connected serial ports");
            }
            var portsArduino = yield SerialDriver.discover({
                manufacturer: /Arduino/
            }).then(ports => async.next(ports));
            winston.info("portsArduino", portsArduino.map(p => p.manufacturer));
            var arduino = ports.filter(p => p.manufacturer.startsWith("Arduino"));
            should.strictEqual(portsArduino.length, arduino.length);
            done();
        }();
        async.next();
    });
    it("serialPortOptions(options) returns SerialDriver options", function() {
        should.deepEqual(SerialDriver.serialPortOptions(), {
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
        });
        should.deepEqual(SerialDriver.serialPortOptions({
            baudRate: 19200
        }), {
            parser: SerialPort.parsers.readline('\n'),
            lock: true,
            baudRate: 19200,
            dataBits: 8,
            stopBits: 1,
            rtscts: false,
            xon: false,
            xoff: false,
            xany: false,
            bufferSize: 65536,
            autoOpen: false,
        });
    });
    it("async/Promise handles promise rejection", function(done) {
        var sequence = [];
        let async = function*() {
            try {
                sequence.push("start");
                var result = yield new Promise((resolve, reject) => reject(new Error("whoa")))
                    .catch(err => {
                        sequence.push("catch");
                        async.throw(err);
                    });
                should.ok(false, "should never execute#1");
            } catch (err) {
                should.strictEqual("whoa", err.message);
                sequence.push("end");
                should.deepEqual(sequence, ["start", "after", "catch", "end"]);
                done();
            }
        }();
        async.next();
        sequence.push("after");
    });
    it("Promise/async handles promise exceptions", function(done) {
        var sequence = [];
        var promise = new Promise((resolve, reject) => {
            let async = function*() {
                try {
                    sequence.push("start");
                    var result = yield setTimeout(() => async.throw(new Error("whoa")), 0);
                    should.ok(false, "should never execute#1");
                } catch (err) {
                    sequence.push("catch"); // from async.throw
                    reject(err);
                }
            }();
            async.next();
            sequence.push("after");
        });
        promise.catch(err => {
            sequence.push("end");
            should.deepEqual(sequence, ["start", "after", "catch", "end"]);
            done();
        });
    });
    it("matchesPort(filter, port) returns true if filter matches port", function() {
        var portNone = {
            comName: "/dev/ttyNotThere",
            manufacturer: null,
        };
        var portArduino = {
            comName: "/dev/ttyArdino",
            manufacturer: "Arduino_etc",
        };
        var portOther = {
            comName: "/dev/ttyOther",
            manufacturer: "SomeCompany",
        };
        var ports = [portNone, portArduino, portOther];
        var filterMfg = {
            manufacturer: /./
        };
        var filterArduino = {
            manufacturer: /Arduino/
        };
        var filterNone = {
            manufacturer: null,
        };
        should.deepEqual(ports.map(p => SerialDriver.matchesPort(filterMfg, p)), [false, true, true]);
        should.deepEqual(ports.map(p => SerialDriver.matchesPort(filterArduino, p)), [false, true, false]);
        should.deepEqual(ports.map(p => SerialDriver.matchesPort(filterNone, p)), [true, false, false]);
    });
    it("open(filter) opens first unlocked port", function(done) {
        let async = function*() {
            function asyncPromise(p) { p.then(r => async.next(r)).catch(e => async.throw(e)); }
            try {
                var ports = yield asyncPromise(SerialDriver.discover());
                if (!ports.length) {
                    winston.info("no ports available to test open()");
                    done();
                    return;
                }
                var port = ports[0];
                var sd1 = new SerialDriver();
                var sd2 = new SerialDriver();
                should.strictEqual(sd1.isOpen(), false);
                yield asyncPromise(sd1.open());
                should.strictEqual(sd1.isOpen(), true);
                should.strictEqual(sd1.state.serialPath, port.comName);
                try { // sd1 is open and locked. sd2 should fail
                    yield asyncPromise(sd2.open());
                    should.strictEqual("should never execute", false);
                } catch (err) {
                    should(err).instanceOf(Error);
                    err.message.should.match(/lock/);
                    winston.info("OK: open() rejects locked port");
                }
                yield asyncPromise(sd1.close());
                should.strictEqual(sd1.isOpen(), false);
                try { // sd1 is closed, so we can open sd2 now
                    yield asyncPromise(sd2.open(port));
                    should.strictEqual(sd2.isOpen(), true);
                    should.strictEqual(sd2.state.serialPath, port.comName);
                    winston.info("OK: open() resolves unlocked port");
                } catch (err) {
                    winston.error(err);
                    should.strictEqual("should never execute", false);
                }
                yield asyncPromise(sd2.close());
                done();
            } catch (err) {
                winston.error(err);
            }
        }();
        async.next();
    });
})
