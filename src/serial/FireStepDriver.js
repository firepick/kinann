(function(exports) {
    const SerialPort = require('serialport');
    const winston = require('winston');

    class FireStepDriver {
        constructor() {
            this.state = {
                serialPath: null,
                synced: false,
            };
        }

        static discover() {
            return new Promise((resolve, reject) => {
                let async = function *() { try {
                    var ports = yield SerialPort.list(
                        (err, ports) => err ? async.throw(err) : async.next(ports) );
                    var connectedPorts = ports.filter(p => p.serialNumber);
                    var arduinoPorts = connectedPorts.filter(p => p.manufacturer.startsWith("Arduino"));
                    resolve(arduinoPorts.length ? arduinoPorts : connectedPorts);
                } catch (err) { reject(err); } }();
                async.next(); 
            });
        }

        static serialPortOptions() {
            return {
                parser: SerialPort.parsers.readline('\n'),
                lock: false,
                baudRate: 19200,
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

        open(port, options = FireStepDriver.serialPortOptions()) {
            var that = this;
            var state = this.state;
            return new Promise((resolve, reject) => { 
                let async = function *() { try {
                    if (port == null) {
                        port = yield FireStepDriver.discover()
                            .then(ports => async.next(ports[0]))
                            .catch(err => async.throw(err));
                    }
                    winston.debug("FireStepDriver", port.comName, "SerialPort.open()...");
                    var sp = new SerialPort(port.comName, options);
                    sp.on('open', () => { winston.info("FireStepDriver", port.comName, "SerialPort.open() OK"); });
                    sp.on('close', () => { winston.info("FireStepDriver", port.comName, "closed"); });
                    sp.on('error', (err) => { console.log("error", err); });
                    state.synced = false;
                    sp.on('data', (line) => { 
                        line = line.trim();
                        var synced = state.synced;
                        if (!state.synced && line.startsWith('{"s":0,"r"') && line.endsWith('}')) {
                            try {
                                var json = JSON.parse(line);
                                synced = json.r && json.r.id && true;
                            } catch(err) {
                                winston.info("serial error", err.message, "line:", line);
                            }
                            if (synced) {
                                state.serialPath = port.comName;
                                state.id = json.r.id;
                            }
                        }
                        if (state.synced) {
                            winston.info("FireStep:", line); 
                        } else if (!synced) {
                            winston.debug("FireStep sync in progress. Ignoring:", line); 
                        } else {
                            state.synced = synced;
                            winston.info("FireStepDriver", port.comName, 
                                "=> id:"+JSON.stringify(state.id))
                            resolve(sp);    
                        }
                    });
                    yield sp.open((err) => err ? async.throw(err) : async.next(true));

                    // SerialPort does not capture initial FireStep serial output properly, so skip it
                    yield setTimeout(() => async.next(true), 1000);

                    // synchronize
                    yield sp.write('{"id":""}\n', (err) => err ? async.throw(err) : async.next(true)); 
                    yield setTimeout(() => !state.synced && async.throw(
                        new Error("FireStepDriver could not connect to FireStep")
                    ), 1000);
                } catch(err) { reject(err); } }(); // async
                async.next(); 
            });
        }

    } // class FireStepDriver

    module.exports = exports.FireStepDriver = FireStepDriver;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("FireStepDriver", function() {
    const should = require("should");
    const winston = require('winston');
    const SerialPort = require('serialport');
    const FireStepDriver = exports.FireStepDriver || require("../src/serial/FireStepDriver");
    winston.level = "warn";

    it("TESTING", function(done) {
        let async = function*() {
            console.log(`
========================================================
FireStepDriver tests interact with real hardware.
Run tests for all required scenarios:
1) no serial devices connected 
2) one Arduino connected
3) multiple Arduinos connected (unsupported)
4) one or more non-Arduinos connected (unsupported)
5) Arduinos and non-Arduinos connected (unsupported)
            `);
            var ports = yield FireStepDriver.discover().then(ports => async.next(ports))
            if (ports.length) {
                ports.forEach((p,i) => console.log(`PORT#${i+1} ${p.comName} is connected to ${p.manufacturer}`));
            } else {
                console.log("Detected no connected serial ports");
            }
            console.log(`========================================================`);
            done();
        }();
        async.next();
    });
    it("TESTdiscover() returns list of connected serial ports", function(done) {
        let async = function*() {
            var ports = yield FireStepDriver.discover().then(ports => async.next(ports));
            if (ports.length) {
                var arduino = 0;
                // all discovered ports are connected
                ports.forEach((p) => {
                    p.manufacturer.startsWith("Arduino" && arduino++);
                    should.exist(p.serialNumber); // connected port
                });
                // arduino ports are preferred
                arduino == 0 || arduino === ports.length;
            }
            done();
        }();
        async.next();
    });
    it("TESTserialPortOptions() returns the serial port options", function() {
        should.deepEqual(FireStepDriver.serialPortOptions(), {
            parser: SerialPort.parsers.readline('\n'),
            lock: false,
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
    it("TESTopen(port) opens the given or available port", function(done) {
        winston.level="debug";
        let async = function*() { 
            var fsd = new FireStepDriver();
            var ports = yield FireStepDriver.discover().then(ports => async.next(ports))
            if (ports.length) {
                var serialPort = yield fsd.open().then(r => async.next(r));
                should.strictEqual(true, serialPort.isOpen());
                fsd.state.id.should.properties({app:'FireStep'});
            } else { 
                var result = yield fsd.open().catch(e => async.next(e));
                should(result).instanceOf(Error);
            }
            done();
        }();
        async.next();
    });
    it("Serialport", function(done) {
        this.timeout(10000);
        let async = function*() {
            var fsd = new FireStepDriver();
            var ports = yield FireStepDriver.discover().then(ports => async.next(ports));
            if (ports.length) {
                console.log("opening serial port", ports[0].comName);
                var port = new SerialPort(ports[0].comName, FireStepDriver.serialPortOptions());
                should.strictEqual(false, port.isOpen());
                port.on('open', () => { console.log("opened"); });
                port.on('close', () => { winston.info("FireStepDriver", port.comName, "closed"); });
                port.on('error', (err) => { console.log("error", err); });
                var synced = false;
                port.on('data', (line) => { 
                    if (!synced && line[0] === '{') {
                        var json = JSON.parse(line);
                        synced = json.r && json.r.id && true;
                    }
                    console.log("synced", synced, "line", line); 
                });
                var result = yield port.open((err) => err ? async.throw(err) : async.next(1));
                should.strictEqual(result, 1);
                should.strictEqual(port.isOpen(), true);
                var result = yield setTimeout(() => async.next(1.1), 1000);
                should.strictEqual(result, 1.1);
                port.flush(() => console.log("flushed input"));
                var result = yield port.write('{"id":""}\n', (err) => err ? async.throw(err) : async.next(2)); 
                should.strictEqual(result, 2);
                var result = yield setTimeout(() => async.next(2.1), 200);
                should.strictEqual(result, 2.1);
                console.log("dim");
                var result = yield port.write('{"sys":""}\n', (err) => err ? async.throw(err) : async.next(3)); 
                console.log("A2");
                should.strictEqual(result, 3);
                var result = yield setTimeout(() =>  async.next(3.1), 500);
                should.strictEqual(result, 3.1);
            } else {
                console.log("No connected serial ports detected");
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
                    .catch(err => async.throw(err));
                should.ok(false, "should never execute#1");
            } catch (err) {
                should.strictEqual("whoa", err.message);
                sequence.push("end");
                should.deepEqual(sequence, ["start", "after", "end"]);
                done();
            }
        }();
        async.next();
        sequence.push("after");
    });
    it("TESTPromise/async handles promise rejection", function(done) {
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
})
