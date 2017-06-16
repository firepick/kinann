(function(exports) {
    const SerialPort = require('serialport');
    const SerialDriver = require('./SerialDriver');
    const winston = require('winston');

    class FireStepDriver extends SerialDriver {
        constructor() {
            super();
            this.state.synced = false;
        }

        static defaultFilter() {
            return {
                manufacturer: /^Arduino/,
            }
        }

        static discover(filter = FireStepDriver.defaultFilter()) {
            return SerialDriver.discover(filter);
        }

        static serialPortOptions() {
            return Object.assign(SerialDriver.serialPortOptions(), {
                baudRate: 19200,
            });
        }

        open(filter = FireStepDriver.defaultFilter(), options = FireStepDriver.serialPortOptions()) {
            var that = this;
            var state = this.state;
            var superOpen = super.open;
            return new Promise((resolve, reject) => {
                let async = function*() {
                    function asyncPromise(p) { p.then(r=>async.next(r)).catch(e=>async.throw(e));}
                    try {
                        var sp = yield asyncPromise(superOpen.call(that, filter, options));
                        state.synced = false;
                        sp.on('error', (err) => winston.error("error", err));
                        sp.on('data', (line) => {
                            line = line.trim();
                            var synced = state.synced;
                            if (!state.synced) {
                                if (!line.startsWith('{"s":0,"r":{"id"')) {
                                    winston.info("skipping unknown response => ", line);
                                } else if (!line.endsWith('}')) {
                                    winston.info("skipping invalid response => ", line);
                                } else {
                                    try {
                                        winston.debug("FireStepDriver sync =>", line);
                                        var json = JSON.parse(line);
                                        synced = true;
                                        state.id = json.r.id;
                                        winston.info("FireStepDriver synced => ", line);
                                    } catch (err) {
                                        winston.error("FireStepDriver could not sync:", err.message, "line:", line);
                                    }
                                }
                            }
                            if (state.synced) {
                                winston.info("FireStep:", line);
                            } else if (!synced) {
                                winston.debug("FireStep sync in progress. Ignoring:", line);
                            } else {
                                state.synced = synced;
                                winston.info("FireStepDriver", state.serialPath,
                                    "=> id:" + JSON.stringify(state.id))
                                resolve(sp);
                            }
                        });

                        // SerialPort does not capture initial FireStep serial output properly, so skip it
                        yield setTimeout(() => async.next(true), 1000);

                        // synchronize
                        yield sp.write('{"id":""}\n', (err) => err ? async.throw(err) : async.next(true));
                        yield setTimeout(() => {
                            if (!state.synced) {
                                winston.debug(that.constructor.name, "closing", sp.path);
                                sp.close();
                                async.throw(new Error("FireStepDriver could not connect to FireStep on " + sp.path))
                            }
                        }, 1500);
                    } catch (err) {
                        reject(err);
                    }
                }(); // async
                async.next();
            });
        }

    } // class FireStepDriver

    module.exports = exports.FireStepDriver = FireStepDriver;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("FireStepDriver", function() {
    /* FireStepDriver tests interact with real hardware.
     * Run tests for all required scenarios:
     * 1) no serial devices connected 
     * 2) one FireStep Arduino connected 
     * 2) one non-FireStep Arduino connected
     * 3) multiple Arduinos connected (unsupported)
     * 4) one or more non-Arduinos connected (unsupported)
     * 5) Arduinos and non-Arduinos connected (unsupported)
     */
    const should = require("should");
    const winston = require('winston');
    const SerialPort = require('serialport');
    const FireStepDriver = exports.FireStepDriver || require("../src/serial/FireStepDriver");
    winston.level = "warn";

    it("serialPortOptions() returns the FireStep serial port options", function() {
        should.deepEqual(FireStepDriver.serialPortOptions(), {
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
    it("open(filter) opens the given or available FireStep port", function(done) {
        this.timeout(3000);
        let async = function*() {
            function asyncPromise(p) { p.then(r=>async.next(r)).catch(e=>async.throw(e)); }
            var fsd = null;
            try {
                fsd = new FireStepDriver();
                var filter = null;
                var ports = yield asyncPromise(FireStepDriver.discover(filter));
                if (ports.length) {
                    winston.debug("opening firestep ports:", ports.map(p=>p.comName));
                    try {
                        var serialPort = yield asyncPromise(fsd.open(filter));
                        should.strictEqual(true, serialPort.isOpen());
                        fsd.state.id.should.properties({
                            app: 'FireStep'
                        });
                        fsd.state.id.should.properties([]);
                        yield asyncPromise(fsd.close());
                        should.strictEqual(false, serialPort.isOpen());
                    } catch (err) {
                        winston.error(err);
                    }
                } else {
                    try {
                        yield asyncPromise(fsd.open());
                        should.strictEqual(1,0,"should never execute");
                    } catch (err) {
                        should(err).instanceOf(Error);
                        err.message.should.match(/found no ports/);
                        winston.info("FireStepDriver open() rejected as expected with no Arduino devices");
                    }
                }
            } catch (err) {
                winston.error(err);
            }
            if (fsd && fsd.isOpen()) {
                fsd.close();
            }
            done();
        }();
        async.next();
    });
})
