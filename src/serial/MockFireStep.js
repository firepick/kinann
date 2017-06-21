(function(exports) {
    const SerialPort = require('serialport');
    const winston = require('winston');

    class MockFireStep {
        constructor(port, options={}) {
            this.opened = false;
            this.path = port || "MockFireStep";
            this.events = {};
            this.position = [null, null, null, null];
            if (options.autoOpen) {
                winston.debug(this.constructor.name, "autoOpen:true");
                this.open();
            }
        }

        open(cb) {
            var that = this;
            if (that.opened) {
                setTimeout(() => {
                    cb && cb(new Error(that.constructor.name + " is already open"));
                }, 0);
            } else {
                that.opened = true;
                setTimeout(() => {
                    that.events.open && that.events.open.forEach(f => f.call(null));
                    cb && cb();
                }, 0);
            }
            return that;
        }

        close(cb) {
            if (this.opened) {
                this.opened = false;
                this.events.close && this.events.close.forEach(f => f.call(null));
                cb && cb();
            } else {
                cb && cb(new Error(this.constructor.name + " is already closed"));
            }
        }

        on(event, cb) {
            this.events[event] = this.events[event] || [];
            this.events[event].push(cb);
            return this;
        }

        isOpen() {
            return this.opened;
        }

        write(request, cb) {
            var that = this;
            winston.debug(that.constructor.name,"write(", request, ")");
            that.request = request;
            cb && cb();
            return that;
        }

        mockResponse(jsonRequest) {
            var jsonResponse = {
                s: 0,
                t: 0,
            };
            try {
                jsonResponse.r = jsonRequest;
                if (jsonRequest.hom != null) {
                    this.position.forEach((p, i) => {
                        jsonRequest.hom[i+1] != null && (this.position[i] = jsonRequest.hom[i+1]);
                    });
                } else if (jsonRequest.mov != null) {
                    this.position.forEach((p, i) => {
                        jsonRequest.mov[i+1] != null && (this.position[i] = jsonRequest.mov[i+1]);
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

        drain(cb) {
            var that = this;
            winston.debug(that.constructor.name,"drain()");
            cb && cb(null);
            setTimeout(() => {
                var jsonResponse = {
                    s: 0,
                    t: 0,
                };
                try {
                    winston.debug(that.constructor.name, "handling request", that.request);
                    var jsonRequest = JSON.parse(that.request);
                    jsonResponse = that.mockResponse(jsonRequest);
                } catch (err) {
                    jsonResponse.s = -911;
                    jsonResponse.e = err.message;
                }
                var response = JSON.stringify(jsonResponse);
                that.events.data && that.events.data.forEach(f => f.call(null, response));
            }, 0);
            return this;
        }


    } // class MockFireStep

    module.exports = exports.MockFireStep = MockFireStep;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("MockFireStep", function() {
    const should = require("should");
    const winston = require('winston');
    const MockFireStep = exports.MockFireStep || require("../src/serial/MockFireStep");
    winston.level = "warn";

    it("TESTopen() opens the given port", function(done) {
        let async = function*() {
            var mfs = new MockFireStep();
            should.strictEqual(mfs.isOpen(), false);
            var nOpen = 0;
            mfs.on('open', (err) => nOpen++);
            yield mfs.open((err) => err ? async.throw(err) : async.next(true));
            should.strictEqual(mfs.isOpen(), true);
            should.strictEqual(nOpen, 1);
            done();
        }();
        async.next();
    });
    it("write(request, cb) writes data", function(done) {
        let async = function*() {
            var mfs = new MockFireStep();
            var nLine = 0;
            mfs.on('data', (line) => {
                nLine++;
                winston.debug("onData()", line);
                async.next(line);
            });
            yield mfs.open((err) => {
                winston.debug("open cb", err);
                err ? async.throw(err) : async.next('{"next":"open"}');
            });
            var request = {
                id:""
            };
            var promise = new Promise((resolve, reject) => {
                mfs.write(JSON.stringify(request));
                mfs.drain((err) => {
                    winston.debug("drain cb", err);
                    err ? reject(err) : resolve('{"next":"drain"}');
                });
            });
            yield promise.then(r=>async.next(r)).catch(e=>async.throw(e));
            var line = yield setTimeout(() => nLine === 0 && async.throw(new Error("timeout")), 500);
            var json = JSON.parse(line);
            should.deepEqual(json, mfs.mockResponse(request));
            done();
        }();
        async.next();
    });
    it("TESTmockResponse({hom:...}) returns mock homing response", function() {
        var mfs = new MockFireStep();
        should.deepEqual(mfs.position, [null, null, null, null]);
        should.deepEqual(mfs.mockResponse({
            hom:{
                "1": 100,
                "3": 300,
            }
        }), {
            s: 0,
            t:0,
            r:{
                hom: {
                    "1": 100,
                    "3": 300,
                }
            },
        });
        should.deepEqual(mfs.position, [100, null, 300, null]);
        should.deepEqual(mfs.mockResponse({
            hom:{
                "2": 200,
            }
        }), {
            s: 0,
            t:0,
            r:{
                hom: {
                    "2": 200,
                }
            },
        });
        should.deepEqual(mfs.position, [100, 200, 300, null]);
    });
    it("TESTmockResponse({mov:...}) returns mock movement response", function() {
        var mfs = new MockFireStep();
        mfs.mockResponse({
            hom: { 
                1:0,
                2:0,
                3:0,
            },
        });
        should.deepEqual(mfs.position, [0, 0, 0, null]);
        should.deepEqual(mfs.mockResponse({
            mov:{
                "1": 100,
                "3": 300,
            }
        }), {
            s: 0,
            t:0,
            r:{
                mov: {
                    "1": 100,
                    "3": 300,
                }
            },
        });
        should.deepEqual(mfs.position, [100, 0, 300, null]);
        should.deepEqual(mfs.mockResponse({
            mov:{
                "2": 200,
            }
        }), {
            s: 0,
            t:0,
            r:{
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
            id:"",
        }), {
            s: 0,
            t:0,
            r:{
                id: {
                    app: "FireStep",
                    ch: "mock",
                    git: "MockFireStep_git",
                    ver: "MockFireStep_ver",
                }
            },
        });
    });
    it("TESTmockResponse({sys:...}) returns mock system response", function() {
        var mfs = new MockFireStep();
        should.deepEqual(mfs.mockResponse({
            sys:"",
        }), {
            s: 0,
            t:0,
            r:{
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
