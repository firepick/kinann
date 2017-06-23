(function(exports) {
    const SerialDriver = require('./SerialDriver');

    class MockSerialDriver extends SerialDriver {

        constructor(options = {}) {
            super();
            this.mockSerialTimeout = options.mockSerialTimeout == null ? 0 : options.mockSerialTimeout;
            this.commands = [];
        }

        home(motorPos) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        this.commands.push({
                            home: motorPos
                        });
                        resolve(motorPos);
                    } catch (err) {
                        reject(err);
                    }
                }, this.mockSerialTimeout);
            });
        }

        moveTo(motorPos) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        this.commands.push({
                            moveTo: motorPos
                        });
                        resolve(motorPos);
                    } catch (err) {
                        reject(err);
                    }
                }, this.mockSerialTimeout);
            });
        }

    }

    module.exports = exports.MockSerialDriver = MockSerialDriver;
})(typeof exports === "object" ? exports : (exports = {}));