(function(exports) {
    const MockSerialPort = require('./MockSerialPort');
    const winston = require('winston');

    class MockFireStep extends MockSerialPort {
        constructor(port, options) {
            super((port = port||"MockFireStep"), options);
            this.position = [null, null, null, null];
        }

        mockResponse(jsonRequest) {
            if (typeof jsonRequest === 'string') {
               var jsonRequest = JSON.parse(jsonRequest);
            }
            var jsonResponse = {
                s: 0,
                t: 0,
            };
            try {
                jsonResponse.r = jsonRequest;
                if (jsonRequest.hom != null) {
                    this.position.forEach((p, i) => {
                        jsonRequest.hom[i + 1] != null && (this.position[i] = jsonRequest.hom[i + 1]);
                    });
                } else if (jsonRequest.mov != null) {
                    this.position.forEach((p, i) => {
                        jsonRequest.mov[i + 1] != null && (this.position[i] = jsonRequest.mov[i + 1]);
                    });
                } else if (jsonRequest.id != null) {
                    jsonResponse.r = {
                        id: {
                            app: "FireStep",
                            ch: "mock",
                            git: "MockFireStep_git",
                            ver: "MockFireStep_ver",
                        }
                    };
                } else if (jsonRequest.sys != null) {
                    jsonResponse.r = {
                        sys: {
                            ah: false,
                            as: false,
                            eu: false,
                            hp: 3,
                            jp: false,
                            lh: false,
                            mv: 18000,
                            om: 0,
                            pb: 2,
                            pc: 2,
                            pi: 11,
                            pu: 0,
                            sd: 800,
                            to: 0,
                            tv: 0.6,
                            v: 1.1,
                        }
                    };
                }
            } catch (err) {
                jsonResponse.s = -911;
                jsonResponse.e = err.message;
            }
            return jsonResponse;
        }

    } // class MockFireStep

    module.exports = exports.MockFireStep = MockFireStep;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("MockFireStep", function() {
    const should = require("should");
    const winston = require('winston');
    const MockFireStep = exports.MockFireStep || require("../index").serial.MockFireStep;
    winston.level = "warn";

    it("open() opens the given port", function(done) {
        let async = function*() {
            try {
                var mfs = new MockFireStep(null, {autoOpen:false});
                should.strictEqual(mfs.isOpen(), false);
                var nOpen = 0;
                mfs.on('open', (err) => nOpen++);
                yield mfs.open((err) => err ? async.throw(err) : async.next(true));
                should.strictEqual(mfs.isOpen(), true);
                should.strictEqual(nOpen, 1);
                done();
            } catch (err) {
                winston.error(err);
            }
        }();
        async.next();
    });
    it("write(request, cb) writes data", function(done) {
        let async = function*() {
            try {
                var mfs = new MockFireStep();
                var nLine = 0;
                mfs.on('data', (line) => {
                    nLine++;
                    winston.debug("onData()", line);
                    async.next(line);
                });
                var request = {
                    id: ""
                };
                var promise = new Promise((resolve, reject) => {
                    mfs.write(JSON.stringify(request));
                    mfs.drain((err) => {
                        winston.debug("drain cb", err);
                        err ? reject(err) : resolve('{"next":"drain"}');
                    });
                });
                yield promise.then(r => async.next(r)).catch(e => async.throw(e));
                var line = yield setTimeout(() => nLine === 0 && async.throw(new Error("timeout")), 500);
                var json = JSON.parse(line);
                should.deepEqual(json, mfs.mockResponse(request));
                done();
            } catch(err) {
                winston.error(err);
            }
        }();
        async.next();
    });
    it("mockResponse({hom:...}) returns mock homing response", function() {
        var mfs = new MockFireStep();
        should.deepEqual(mfs.position, [null, null, null, null]);
        should.deepEqual(mfs.mockResponse({
            hom: {
                "1": 100,
                "3": 300,
            }
        }), {
            s: 0,
            t: 0,
            r: {
                hom: {
                    "1": 100,
                    "3": 300,
                }
            },
        });
        should.deepEqual(mfs.position, [100, null, 300, null]);
        should.deepEqual(mfs.mockResponse({
            hom: {
                "2": 200,
            }
        }), {
            s: 0,
            t: 0,
            r: {
                hom: {
                    "2": 200,
                }
            },
        });
        should.deepEqual(mfs.position, [100, 200, 300, null]);
    });
    it("mockResponse({mov:...}) returns mock movement response", function() {
        var mfs = new MockFireStep();
        mfs.mockResponse({
            hom: {
                1: 0,
                2: 0,
                3: 0,
            },
        });
        should.deepEqual(mfs.position, [0, 0, 0, null]);
        should.deepEqual(mfs.mockResponse({
            mov: {
                "1": 100,
                "3": 300,
            }
        }), {
            s: 0,
            t: 0,
            r: {
                mov: {
                    "1": 100,
                    "3": 300,
                }
            },
        });
        should.deepEqual(mfs.position, [100, 0, 300, null]);
        should.deepEqual(mfs.mockResponse({
            mov: {
                "2": 200,
            }
        }), {
            s: 0,
            t: 0,
            r: {
                mov: {
                    "2": 200,
                }
            },
        });
        should.deepEqual(mfs.position, [100, 200, 300, null]);
    });
    it("mockResponse({id:...}) returns mock identification response", function() {
        var mfs = new MockFireStep();
        should.deepEqual(mfs.mockResponse({
            id: "",
        }), {
            s: 0,
            t: 0,
            r: {
                id: {
                    app: "FireStep",
                    ch: "mock",
                    git: "MockFireStep_git",
                    ver: "MockFireStep_ver",
                }
            },
        });
    });
    it("mockResponse({sys:...}) returns mock system response", function() {
        var mfs = new MockFireStep();
        should.deepEqual(mfs.mockResponse({
            sys: "",
        }), {
            s: 0,
            t: 0,
            r: {
                sys: {
                    ah: false,
                    as: false,
                    eu: false,
                    hp: 3,
                    jp: false,
                    lh: false,
                    mv: 18000,
                    om: 0,
                    pb: 2,
                    pc: 2,
                    pi: 11,
                    pu: 0,
                    sd: 800,
                    to: 0,
                    tv: 0.6,
                    v: 1.1,
                }
            },
        });
    });
})
