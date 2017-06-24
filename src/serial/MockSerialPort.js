(function(exports) {
    const winston = require('winston');

    const defaultOptions = {
        autoOpen: true,
    }

    class MockSerialPort {
        constructor(port, options = defaultOptions) {
            port = port || "MockSerialPort";
            if (typeof port !== 'string') {
                throw new Error(this.constructor.name + " expects a string for port:" + JSON.stringify(port));
            }
            this.opened = false;
            this.path = port;
            this.events = {};
            this.requests = [];
            if (options.autoOpen) {
                winston.debug(this.constructor.name, "autoOpen:true");
                this.open();
            }
        }
        isOpen() {
            return this.opened;
        }
        open(cb) {
            winston.debug(this.constructor.name, "open()");
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

        write(request, cb) {
            winston.debug(this.constructor.name, "write(", request, ")");
            this.requests.push(request);
            cb && cb();
            return this;
        }

        mockResponse(request) {
            return "OK" + this.requests.length;
        }

        drain(cb) {
            var that = this;
            cb && cb(null);
            setTimeout(() => {
                var request = that.requests[that.requests.length - 1];
                winston.debug(that.constructor.name, "handling request", request);
                var response = that.mockResponse.call(that,request);
                if (typeof response !== 'string') {
                    response = JSON.stringify(response);
                }
                that.events.data && that.events.data.forEach(f => f.call(null, response));
            }, 0);
            return this;
        }

    } // class MockSerialPort

    module.exports = exports.MockSerialPort = MockSerialPort;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("MockSerialPort", function() {
    const should = require("should");
    const winston = require('winston');
    const MockSerialPort = exports.MockSerialPort || require("../index").serial.MockSerialPort;
    winston.level = "warn";

    it("open() opens the given port", function(done) {
        let async = function*() {
            try {
                var msp = new MockSerialPort(null, {
                    autoOpen: false,
                });
                should.strictEqual(msp.isOpen(), false);
                var nOpen = 0;
                msp.on('open', (err) => nOpen++);
                yield msp.open((err) => err ? async.throw(err) : async.next(true));
                should.strictEqual(msp.isOpen(), true);
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
                var msp = new MockSerialPort();
                var nLine = 0;
                msp.on('data', (line) => {
                    nLine++;
                    winston.debug("onData()", line);
                    async.next(line);
                });
                var request = {
                    id: ""
                };
                var promise = new Promise((resolve, reject) => {
                    msp.write(JSON.stringify(request));
                    msp.drain((err) => {
                        winston.debug("drain cb", err);
                        err ? reject(err) : resolve('{"next":"drain"}');
                    });
                });
                yield promise.then(r => async.next(r)).catch(e => async.throw(e));
                var eTimeout = new Error("timeout");
                var line = yield setTimeout(() => nLine === 0 && async.throw(eTimeout), 500);
                should.deepEqual(line, "OK1");
                done();
            } catch (err) {
                winston.error(err);
            }
        }();
        async.next();
    });
})
