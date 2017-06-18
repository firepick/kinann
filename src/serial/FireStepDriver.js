(function(exports) {
    const SerialPort = require('serialport');
    const SerialDriver = require('./SerialDriver');
    const winston = require('winston');

    class FireStepDriver extends SerialDriver {
        constructor() {
            super();
            this.state.synced = false;
            this.onDataAsync = null;
            this.msCommand = 500;
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

        send(request, async, msTimeout) {
            var that = this;
            var superWrite = super.write;
            let asyncWrite = function*() {
                var sp = that.serialPort;
                var prefix = that.constructor.name + " " + sp.path;
                winston.info(prefix, "send()", request.trim());
                if (that.onDataAsync) {
                    throw new Error(prefix + " existing command has not completed");
                }
                yield superWrite.call(that, request)
                    .then(r=>asyncWrite.next(r))
                    .catch(e=>asyncWrite.throw(e));
                that.onDataAsync = async; 
                setTimeout(() => {
                    if (that.onDataAsync) {
                        sp.close();
                        var err = new Error(prefix + " could not connect to FireStep. SerialPort closed");
                        winston.error(prefix, "timeout");
                        async.throw(err);
                    } else {
                        // onData called async.next(line)
                    }
                }, msTimeout);
            }();
            asyncWrite.next();
        }

        onData(line) {
            line = line.trim();
            if (!line.endsWith('}')) {
                winston.warn(this.constructor.name,"incomplete JSON ignored=>", line);
                return;
            }
            winston.debug(this.constructor.name, this.state.serialPath, "onData()", line);
            if (!this.state.synced && !line.startsWith('{"s":0,"r":{"id"')) {
                winston.debug(this.constructor.name, this.state.serialPath, "onData() ignoring", line);
                return;
            }
            var onDataAsync = this.onDataAsync;
            this.onDataAsync = null;
            onDataAsync.next(line);
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
                        sp.on('error', (err) => winston.error("error", err));
                        sp.on('data', (line) => that.onData.call(that, line));
                        state.synced = false;
                        yield setTimeout(() => async.next(true), 1000); // ignore initial FireStep output
                        var line = yield that.send('{"id":""}\n', async, that.msCommand);
                        state.synced = true;
                        state.id = JSON.parse(line).r.id;
                        var line = yield that.send('{"sys":""}\n', async, that.msCommand);
                        state.sys = JSON.parse(line).r.sys;

                        winston.info(that.constructor.name, sp.path, "synced", state.id);
                        resolve(sp);
                    } catch (err) {
                        reject(err);
                    }
                }(); // async
                async.next();
            });
        }

        homeRequest(axes=[]) {
            var cmd = { 
                hom: "",
            };
            if (axes.length) {
                var hom = {};
                axes.forEach((a,i) => {
                    a != null && (hom[i+1] = a);
                });
                cmd = {hom};
            }
            return JSON.stringify(cmd);
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
    it("TESTopen(filter) opens the given or available FireStep port", function(done) {
        this.timeout(3000);
        winston.level = "info";
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
                        fsd.state.id.should.properties(["app", "ch", "git", "ver"]);
                        fsd.state.sys.should.properties(["to","mv"]);
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
    it("TESThomeRequest(axes) returns home request", function() {
        var fsd = new FireStepDriver();
        should.equal(fsd.homeRequest(), '{"hom":""}');
        should.equal(fsd.homeRequest([]), '{"hom":""}');
        should.equal(fsd.homeRequest([100]), '{"hom":{"1":100}}');
        should.equal(fsd.homeRequest([null, 200]), '{"hom":{"2":200}}');
        should.equal(fsd.homeRequest([-100, 0, 300, null]), '{"hom":{"1":-100,"2":0,"3":300}}');
    });
})
