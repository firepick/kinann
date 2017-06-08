const mathjs = require("mathjs");
const StepperDrive = require("./StepperDrive");
const DriveFrame = require("./DriveFrame");
const Calibration = require("./Calibration");
const Factory = require("./Factory");

(function(exports) {
    class AnnCalibration extends Calibration {
        constructor () {
            super();
        }

        compile(driveFrame, options={}) {
            var factory = new Factory(driveFrame.variables(options));
            return driveFrame.annMeasured = factory.createNetwork({
                preTrain: options.preTrain == null 
                    ? false // pre-training decreeases accuracy with backlash
                    : options.preTrain, 
            });
        }

        calibrate(driveFrame, examples, options={}) {
            var factory = new Factory(driveFrame.variables(options));
            driveFrame.annMeasured = driveFrame.annMeasured || this.compile(driveFrame, options);
            var trainResult = driveFrame.annMeasured.train(examples, options);
            options.onTrain && options.onTrain(trainResult);
            var annCalibrated = factory.inverseNetwork(driveFrame.annMeasured, options);
            return driveFrame.calibration = annCalibrated;
        }

    } // class AnnCalibration

    module.exports = exports.AnnCalibration = AnnCalibration;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("AnnCalibration", function() {
    const should = require("should");
    //const AnnCalibration = require("./AnnCalibration");
    const AnnCalibration = exports.AnnCalibration;
    const DriveFrame = require("../src/DriveFrame");
    const BeltDrive = StepperDrive.BeltDrive;
    const ScrewDrive = StepperDrive.ScrewDrive;
    var sequence = function* (start,last,inc=1, it) {
        for (var v = start; inc<0 && v>=last || inc>0 && v<=last; v+=inc) {
            yield v;
        }
        it && (yield* it);
    }

    var belt300 = new BeltDrive({
        minPos: -1,
        maxPos: 300,
        teeth: 20,
    });
    var belt200 = new BeltDrive({
        minPos: -2,
        maxPos: 200,
    });
    var screw = new ScrewDrive({
        minPos: -3,
        lead: 1,
    });

    it("calibrate(driveFrame, examples) trains DriveFrame to handle backlash", function() {
        this.timeout(60 * 1000);
        var verbose = false;
        var msStart = new Date();

        var frame = new DriveFrame([belt300, belt200, screw]);

        // create calibration examples having actual application measurements
        var trainEx = frame.calibrationExamples(80, {
            measuredPos: (axisPos) => // application provided measurement callback
                mathjs.add(axisPos, [ // mock measurement
                    frame.deadband[0] < 0 ? 1 : 0, // mock x-backlash when reversing
                    frame.deadband[1] < 0 ? 1 : 0, // mock y-backlash when reversing
                    0, // mock no z-backlash
                ]), 
        });

        // calibrate DriveFrame (~2 seconds)
        var annCal = new AnnCalibration();
        var calibrationesult = []; // OPTIONAL: collect annMeasurement and calibration training results
        var calibration = annCal.calibrate(frame, trainEx, {
            onTrain: (result) => calibrationesult.push(result), // OPTIONAL: collect training results
            onEpoch: (result) => verbose && // OPTIONAL: examine training progression
                (result.epochs % 3) == 0 && // show every third epoch
                console.log("onEpoch:"+JSON.stringify(result)),
        });
        should.strictEqual(frame.calibration, calibration);
        verbose && console.log("calibrate ms:", new Date() - msStart, calibrationesult); 
        
        function verifyCalibration(frame) {
            // explore the deadband at [10,10,10] by
            // moving from [9,9,9] to [10,10,10] and reversing y,z to [11,9,9]
            var xpath = sequence(9, 11, 0.1);
            var ypath = sequence(9, 10, 0.1, sequence(9.9, 9, -0.1));
            var zpath = sequence(9, 10, 0.1, sequence(9.9, 9, -0.1));
            var calibrationPath = Array(21).fill().map(() => [
                xpath.next().value,
                ypath.next().value,
                zpath.next().value,
            ]);

            frame.home();
            var calState = calibrationPath.map((axisPos) => frame.moveTo(axisPos).calibration.activate(frame.state));
            should.deepEqual(mathjs.round(calState[0],2), [9,9,9,0.5,0.5,0.5]);
            should.deepEqual(mathjs.round(calState[10],2), [10,10,10,0.5,0.5,0.5]);
            should.deepEqual(mathjs.round(calState[11],2), [10.1,9.61,9.9,0.5,0.21,0.21]);
            should.deepEqual(mathjs.round(calState[12],2), [10.2,9.22,9.8,0.5,-0.08,-0.08]);
            should.deepEqual(mathjs.round(calState[13],2), [10.3,8.83,9.7,0.5,-0.37,-0.37]);
            should.deepEqual(mathjs.round(calState[14],2), [10.4,8.6,9.6,0.5,-0.5,-0.5]);
            should.deepEqual(mathjs.round(calState[15],2), [10.5,8.5,9.5,0.5,-0.5,-0.5]);
        }
        verifyCalibration(frame);

        // Deserialized DriveFrame is still calibrated
        var json = JSON.stringify(frame);
        delete frame;
        var frame2 = DriveFrame.fromJSON(json);
        verifyCalibration(frame2); 
    })
})
