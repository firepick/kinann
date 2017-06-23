(typeof describe === 'function') && describe("SerialDriver", function() {
    const should = require("should");
    const winston = require('winston');
    const SerialPort = require('serialport');
    const SerialDriver = exports.SerialDriver || require("../index").serial.SerialDriver;
    winston.level = "warn";

    class MockSerialPort {
        constructor() {
            this.requests = [];
            this.path = "MockSerialPort";
        }
        isOpen() {
            return true;
        }
        write(request, cb) {
            this.requests.push(request);
            cb && cb();
        }
        drain(cb) {
            cb && cb();
        }
    }

    it("discover(filter) returns filtered list of serial ports", function(done) {
        let async = function*() {
            var ports = yield SerialDriver.discover().then(ports => async.next(ports));
            winston.debug("discover() ", ports.length, "ports:", ports.map(p => p.comName));
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
    it("TESTasync/Promise handles promise rejection", function(done) {
        var sequence = [];
        let async = function*() {
            try {
                sequence.push("start");
                var result = yield new Promise((resolve, reject) => reject(new Error("whoa")))
                    .catch(err => {
                        sequence.push("catch1");
                        async.throw(err);
                        sequence.push("catch2"); // yes this gets executed
                    });
                should.ok(false, "should never execute#2");
            } catch (err) {
                should.strictEqual("whoa", err.message);
                sequence.push("end");
                should.deepEqual(sequence, ["start", "after", "catch1", "end"]);
                setTimeout(() => {
                    // statements following async.throw() ARE EXECUTED!!
                    should.deepEqual(sequence, ["start", "after", "catch1", "end", "catch2"]); 
                    done();
                }, 0);
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
            function asyncPromise(p) {
                p.then(r => async.next(r)).catch(e => async.throw(e));
            }
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
    it("write(request) returns Promise resolved when written", function(done) {
        let async = function*() {
            var sd = new SerialDriver();
            var requests = [];
            sd.serialPort = new MockSerialPort(); // inject mock
            should.strictEqual(sd.isOpen(), true);
            var resolved = yield sd.write("asdf").then(r => async.next(r)).catch(e => async.throw(e));
            should.strictEqual(resolved, sd);
            should.strictEqual(sd.serialPort.requests[0], 'asdf');
            done();
        }();
        async.next();
    });
    it("home(options) returns Promise resolved when written", function(done) {
        let async = function*() {
            var sd = new SerialDriver();
            var requests = [];
            sd.serialPort = new MockSerialPort(); // inject mock
            should.strictEqual(sd.isOpen(), true);
            var resolved = yield sd.home([]).then(r => async.next(r)).catch(e => async.throw(e));
            should.strictEqual(resolved, sd);
            should.strictEqual(sd.serialPort.requests[0], 'G28.1');
            done();
        }();
        async.next();
    });
    it("TESTmoveTo(options) returns Promise resolved when written", function(done) {
        let async = function*() {
            var sd = new SerialDriver();
            var requests = [];
            sd.serialPort = new MockSerialPort(); // inject mock
            should.strictEqual(sd.isOpen(), true);
            var eCaught = null;
            try {
                var resolved = yield sd.moveTo([]).then(r => async.next(r)).catch(e => async.throw(e));
            } catch (err) {
                eCaught = err;
            }
            should(eCaught).instanceOf(Error);
            var resolved = yield sd.moveTo([null, 1.4, null, 2.3, null]).then(r => async.next(r)).catch(e => async.throw(e));
            should.strictEqual(resolved, sd);
            should.strictEqual(sd.serialPort.requests[0], 'G1 Y1.4 A2.3');
            done();
        }();
        async.next();
    });
    it("logPrefix returns object name and serial path", function() {
        var sd = new SerialDriver();
        should.strictEqual(sd.logPrefix, "SerialDriver (no serialPort)");
        sd.serialPort = new MockSerialPort(); // inject mock
        should.strictEqual(sd.logPrefix, "SerialDriver MockSerialPort");
        class TestDriver extends SerialDriver {
            constructor() {
                super();
            }
        }
        var td = new TestDriver();
        should.strictEqual(td.logPrefix, "TestDriver (no serialPort)");
        td.serialPort = new MockSerialPort(); // inject mock
        should.strictEqual(td.logPrefix, "TestDriver MockSerialPort");
    });
})
