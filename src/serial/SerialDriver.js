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
            filter = filter || { manufacturer:/./ };
            return new Promise((resolve, reject) => {
                let async = function *() { try {
                    var ports = yield SerialPort.list(
                        (err, ports) => err ? async.throw(err) : async.next(ports) );
                    resolve( ports.filter(p => SerialDriver.matchesPort(filter, p)) );
                } catch (err) { reject(err); } }();
                async.next(); 
            });
        }

        static matchesPort(filter, port) {
            return filter == null || Object.keys(filter).reduce((acc,key) => {
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
                serialPort: {               // filter or SerialPort
                    manufacturer: /./,      // provided by connected USB serial 
                },
            };
        }

        static defaultOptions() {
            return {
                parser: SerialPort.parsers.readline('\n'),
                lock: false,
                baudRate: 9600,
                dataBits: 8,
                stopBits: 1,
                rtscts: false,
                xon: false,
                xoff: false,
                xany: false,
                bufferSize: 65536,
                autoOpen: false,
            }
        }

        open(filter=SerialDriver.defaultFilter(), options = SerialDriver.defaultOptions()) {
            var that = this;
            return new Promise((resolve, reject) => { 
                let async = function *() { try {
                    var ports = yield SerialDriver.discover(filter)
                        .then(ports => async.next(ports))
                        .catch(err => async.throw(err));
                    var port = ports[0];
                    winston.debug("SerialDriver", port.comName, "SerialPort.open()...");
                    var sp = that.serialPort = new SerialPort(port.comName, options);
                    yield sp.open((err) => err ? async.throw(err) : async.next(true));
                    winston.info("SerialDriver", port.comName, 
                        "SerialPort.open()", sp.isOpen() ? "OK" : "FAILED"); 
                    that.state.serialPath = port.comName;
                    resolve(sp);
                } catch(err) { reject(err); } }(); // async
                async.next(); 
            });
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

    it("TESTING", function(done) {
        let async = function*() {
            var ports = yield SerialDriver.discover().then(ports => async.next(ports))
            if (ports.length) {
                ports.forEach((p,i) => console.log(`PORT#${i+1} ${p.comName} is connected to ${p.manufacturer}`));
            } else {
                console.log("SerialDriver detected no connected serial ports");
            }
            done();
        }();
        async.next();
    });
    it("TESTdiscover(filter) returns filtered list of serial ports", function(done) {
        let async = function*() {
            var ports = yield SerialDriver.discover().then(ports => async.next(ports));
            winston.debug("ports", ports.map(p => p.manufacturer));
            var portsArduino = yield SerialDriver.discover({
                manufacturer: /Arduino/
            }).then(ports => async.next(ports));
            winston.debug("portsArduino", portsArduino.map(p => p.manufacturer));
            var arduino = ports.filter(p => p.manufacturer.startsWith("Arduino"));
            portsArduino.length.should.equal(arduino.length);
            done();
        }(); async.next();
    });
    it("TESTdefaultOptions() returns default SerialDriver options", function() {
        should.deepEqual(SerialDriver.defaultOptions(), {
            parser: SerialPort.parsers.readline('\n'),
            lock: false,
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
    });
    it("TESTopen(filter) opens first available port", function(done) {
        winston.level="debug";
        let async = function*() { 
            var fsd = new SerialDriver();
            var filter = SerialDriver.defaultFilter();
            var ports = yield SerialDriver.discover().then(ports => async.next(ports))
            if (ports.length) {
                var serialPort = yield fsd.open(filter).then(r => async.next(r));
                should.strictEqual(serialPort, fsd.serialPort);
                should.strictEqual(true, serialPort.isOpen());
                fsd.state.should.properties({
                    serialPath: fsd.comName,
                });
            } else { 
                var result = yield fsd.open().catch(e => async.next(e));
                should(result).instanceOf(Error);
            }
            done();
        }();
        async.next();
    });
    it("TESTasync/Promise handles promise rejection", function(done) {
        var sequence = [];
        let async = function*() {
            try {
                sequence.push("start");
                var result = yield new Promise((resolve,reject) => reject(new Error("whoa")))
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
    it("TESTPromise/async handles promise exceptions", function(done) {
        var sequence = [];
        var promise = new Promise((resolve, reject) => {
            let async = function*() {
                try {
                    sequence.push("start");
                    var result = yield setTimeout(() => async.throw(new Error("whoa")),0);
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
    it("TESTmatchesPort(filter, port) returns true if filter matches port", function() {
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
})
