(function(exports) {
    const mathjs = require("mathjs");
    const StepperDrive = require("./StepperDrive");
    const DriveFrame = require("./DriveFrame");
    const Calibration = require("./Calibration");
    const Factory = require("./Factory");
    const Example = require("./Example");

    class AnnCalibration extends Calibration {
        constructor() {
            super();
            this.type = "AnnCalibration";
        }

        model_toNominal(model, state) {
            return model.annMeasured.activate(state);
        }

        model_toActual(model, state) {
            return model.annCalibrated.activate(state);
        }

        calibrationExamples(driveFrame, nExamples = 30, options = {}) {
            var vars = driveFrame.basisVariables().slice(0, driveFrame.drives.length);
            var measuredPos = options.measuredPos || ((pos) => pos);
            var targetState = options.targetState ||
                ((state) => Object.assign([], state, measuredPos(driveFrame.drivePos)));
            var separation = options.separation || 1; // stay out of deadband
            return Array(nExamples).fill().map((na, iEx) => {
                if (iEx === 0) {
                    driveFrame.drivePos = driveFrame.drives.map((d) => d.minPos);
                } else {
                    do {
                        var drivePos = vars.map((v) => v.sample());
                        var distance = mathjs.min(mathjs.abs(mathjs.subtract(drivePos, driveFrame.drivePos)));
                    } while (distance < separation);
                    driveFrame.drivePos = drivePos;
                }
                return new Example(driveFrame.state, targetState(driveFrame.state));
            });
        }

        calibrate(driveFrame, examples, options = {}) {
            var factory = new Factory(driveFrame.basisVariables(options));
            this.model.annMeasured = factory.createNetwork({
                preTrain: options.preTrain == null ?
                    false // pre-training decreases accuracy with backlash
                    :
                    options.preTrain,
            });
            var trainResult = this.model.annMeasured.train(examples, options);
            options.onTrain && options.onTrain(trainResult);
            this.model.annCalibrated = factory.inverseNetwork(this.model.annMeasured, options);
            return driveFrame.calibration = this;
        }

        static fromJSON(json) {
            json = typeof json === 'string' ? JSON.parse(json) : json;
            var cal = null;
            if (json.type === "AnnCalibration") {
                var cal = new AnnCalibration();
                cal.model.annMeasured = Factory.fromJSON(json.model.annMeasured);
                cal.model.annCalibrated = Factory.fromJSON(json.model.annCalibrated);
            }
            return cal;
        }

    } // class AnnCalibration

    module.exports = exports.AnnCalibration = AnnCalibration;
})(typeof exports === "object" ? exports : (exports = {}));
