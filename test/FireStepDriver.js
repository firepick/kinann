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
    const MockFireStep = require('../index').serial.MockFireStep;
    const FireStepDriver = exports.FireStepDriver || require('../index').serial.FireStepDriver;
    winston.level = "info";

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
        let async = function*() {
            function asyncPromise(p) { p.then(r=>async.next(r)).catch(e=>async.throw(e)); }
            var fsd = null;
            try {
                fsd = new FireStepDriver();
                var filter = null;
                var ports = yield asyncPromise(FireStepDriver.discover(filter));
                if (ports.length) {
                    winston.warn("opening Arduino ports:", ports.map(p=>p.comName));
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
    it("open(filter) opens a MockFireStep", function(done) {
        this.timeout(3000);
        let async = function*() {
            function asyncPromise(p) { p.then(r=>async.next(r)).catch(e=>async.throw(e)); }
            var fsd = null;
            try {
                fsd = new FireStepDriver({allowMock:true});
                var filter = {
                    manufacturer: "no-match",
                };
                var serialPort = yield asyncPromise(fsd.open(filter));
                should(serialPort).instanceOf(MockFireStep);
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
        should.equal(fsd.homeRequest([null, 200.49]), '{"hom":{"2":200}}');
        should.equal(fsd.homeRequest([-100, 0, 299.5, null]), '{"hom":{"1":-100,"2":0,"3":300}}');
    });
    it("TESTmoveToRequest(axes) returns moveTo request", function() {
        var fsd = new FireStepDriver();
        should.equal(fsd.moveToRequest(), '{"mov":""}');
        should.equal(fsd.moveToRequest([]), '{"mov":""}');
        should.equal(fsd.moveToRequest([100]), '{"mov":{"1":100}}');
        should.equal(fsd.moveToRequest([null, 200.49]), '{"mov":{"2":200}}');
        should.equal(fsd.moveToRequest([-100, 0, 299.5, null]), '{"mov":{"1":-100,"2":0,"3":300}}');
    });
})
