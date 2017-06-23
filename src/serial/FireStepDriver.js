(function(exports) {
    const SerialPort = require('serialport');
    const SerialDriver = require('./SerialDriver');
    const MockFireStep = require('./MockFireStep');
    const winston = require('winston');

    class FireStepDriver extends SerialDriver {
        constructor(options={}) {
            super(options);
            this.state.synced = false;
            this.onDataAsync = null;
            this.msCommand = options.msCommand || 500;
            this.allowMock = options.allowMock == null ? false : options.allowMock;
            this.position = [];
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
                that.state.request = request;
                that.state.response = "(pending)";
                var sp = that.serialPort;
                winston.debug(that.logPrefix, "send()", request.trim());
                if (that.onDataAsync) {
                    throw new Error(that.logPrefix + " existing command has not completed");
                }
                yield superWrite.call(that, request)
                    .then(r=>asyncWrite.next(r))
                    .catch(e=>asyncWrite.throw(e));
                that.onDataAsync = async; 
                setTimeout(() => {
                    if (that.onDataAsync) {
                        sp.close();
                        var err = new Error(that.logPrefix + " could not connect to FireStep. SerialPort closed");
                        winston.error(that.logPrefix, "timeout");
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
                winston.warn(this.logPrefix,"incomplete JSON ignored=>", line);
                return;
            }
            winston.debug(this.logPrefix, "onData()", line);
            if (!this.state.synced && !line.startsWith('{"s":0') && line.indexOf('"r":{"id"')<0) {
                winston.info(this.logPrefix, "onData() ignoring", line);
                return;
            }
            var onDataAsync = this.onDataAsync;
            if (onDataAsync) {
                this.state.response = line;
                this.onDataAsync = null;
                onDataAsync.next(line);
            }
        }

        open(filter = FireStepDriver.defaultFilter(), options = FireStepDriver.serialPortOptions()) {
            var that = this;
            var state = this.state;
            var superOpen = super.open;
            return new Promise((resolve, reject) => {
                let async = function*() {
                    try {
                        var sp = yield superOpen.call(that, filter, options)
                            .then(r=>async.next(r))
                            .catch(e => {
                                if (that.allowMock) {
                                    that.serialPort = new MockFireStep(null, {autoOpen: true});
                                    that.state.serialPath = "MockFireStep";
                                    winston.info(e.message, "=> opening MockFireStep");
                                    async.next(that.serialPort);
                                } else {
                                    async.throw(e);
                                }
                            });
                        sp.on('error', (err) => winston.error(thhat.logPrefix, "error", err));
                        sp.on('data', (line) => that.onData.call(that, line));
                        state.synced = false;
                        yield setTimeout(() => async.next(true), 1000); // ignore initial FireStep output
                        var line = yield that.send('{"id":""}\n', async, that.msCommand);
                        state.synced = true;
                        state.id = JSON.parse(line).r.id;
                        var line = yield that.send('{"sys":""}\n', async, that.msCommand);
                        state.sys = JSON.parse(line).r.sys;

                        winston.info(that.logPrefix, "synced", state.id);
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
                    a != null && (hom[i+1] = Math.round(Number(a)));
                });
                cmd = {hom};
            }
            return JSON.stringify(cmd);
        }

        moveToRequest(axes=[]) {
            var cmd = { 
                mov: "",
            };
            if (axes.length) {
                var mov = {};
                axes.forEach((a,i) => {
                    a != null && (mov[i+1] = Math.round(Number(a)));
                });
                cmd = {mov};
            }
            return JSON.stringify(cmd);
        }

    } // class FireStepDriver

    module.exports = exports.FireStepDriver = FireStepDriver;
})(typeof exports === "object" ? exports : (exports = {}));

