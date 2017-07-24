// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("AnnCalibration", function() {
    const winston = require("winston");
    const should = require("should");
    const mathjs = require("mathjs");
    const AnnCalibration = require("../src/AnnCalibration");
    const DriveFrame = require("../src/DriveFrame");
    const StepperDrive = require("../src/StepperDrive");
    const BeltDrive = StepperDrive.BeltDrive;
    const ScrewDrive = StepperDrive.ScrewDrive;
    var sequence = function*(start, last, inc = 1, it) {
        for (var v = start; inc < 0 && v >= last || inc > 0 && v <= last; v += inc) {
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

    it("calibrationExamples(frame, nExamples) builds calibration random walk examples", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        var annCal = new AnnCalibration();

        // more examples yield higher accuracy
        var examples = annCal.calibrationExamples(frame);
        examples.length.should.equal(30);
        var examples = annCal.calibrationExamples(frame, 10);
        examples.length.should.equal(10);

        // examples always start with home
        should.deepEqual(examples[0].input, [-1, -2, -3, 0.5, 0.5, 0.5]); // home
        should.deepEqual(examples[0].target, [-1, -2, -3, 0.5, 0.5, 0.5]);
        var last = examples.length - 1;
        should.deepEqual(examples[last].input, frame.state);
        frame.drivePos.map((p, i) => p.should.above(frame.drives[i].minPos)); // not home

        // build custom examples with measuredPos option
        var examples = annCal.calibrationExamples(frame, 5, {
            measuredPos: (drivePos) => mathjs.add(drivePos, [1, 2, 3]), // measurement callback
        });
        should.deepEqual(examples[0].input, [-1, -2, -3, 0.5, 0.5, 0.5]); // home
        examples.forEach((ex) => {
            ex.target[0].should.equal(ex.input[0] + 1);
            ex.target[1].should.equal(ex.input[1] + 2);
            ex.target[2].should.equal(ex.input[2] + 3);
        });
    })
    it("calibrate(driveFrame, examples) trains DriveFrame to handle 3D backlash (MAY FAIL)", function(done) {
        this.timeout(30 * 1000);
        var async = function*() {
            try {
                var verbose = false;
                var msStart = new Date();

                var frame = new DriveFrame([belt300, belt200, screw]);
                var annCal = new AnnCalibration();

                // create calibration examples having actual application measurements
                var trainEx = annCal.calibrationExamples(frame, 80, {
                    measuredPos: (drivePos) => // application provided measurement callback
                        mathjs.add(drivePos, [ // mock measurement
                            frame.deadband[0] < 0 ? 1 : 0, // mock x-backlash when reversing
                            frame.deadband[1] < 0 ? 1 : 0, // mock y-backlash when reversing
                            0, // mock no z-backlash
                        ]),
                });

                // calibrate DriveFrame (~2 seconds)
                var calibrationesult = []; // OPTIONAL: collect annMeasurement and calibration training results
                var calibration = annCal.calibrate(frame, trainEx, {
                    onTrain: (result) => calibrationesult.push(result), // OPTIONAL: collect training results
                    onEpoch: (result) => verbose && // OPTIONAL: examine training progression
                        (result.epochs % 3) == 0 && // show every third epoch
                        console.log("onEpoch:" + JSON.stringify(result)),
                });
                should.strictEqual(frame.calibration, calibration);
                verbose && console.log("calibrate ms:", new Date() - msStart, calibrationesult);

                function calibrationPath() {
                    // explore the deadband at [10,10,10] by
                    // moving from [9,9,9] to [10,10,10] and reversing y,z to [11,9,9]
                    var xpath = sequence(9, 11, 0.1);
                    var ypath = sequence(9, 10, 0.1, sequence(9.9, 9, -0.1));
                    var zpath = sequence(9, 10, 0.1, sequence(9.9, 9, -0.1));
                    return Array(21).fill().map(() => [
                        xpath.next().value,
                        ypath.next().value,
                        zpath.next().value,
                    ]);
                }

                function verifyCalibration(calState) {
                    should.deepEqual(mathjs.round(calState[0], 2), [9, 9, 9, 0.5, 0.5, 0.5]);
                    should.deepEqual(mathjs.round(calState[10], 2), [10, 10, 10, 0.5, 0.5, 0.5]);
                    should.deepEqual(mathjs.round(calState[11], 2), [10.1, 9.61, 9.9, 0.5, 0.21, 0.21]);
                    should.deepEqual(mathjs.round(calState[12], 2), [10.2, 9.22, 9.8, 0.5, -0.08, -0.08]);
                    should.deepEqual(mathjs.round(calState[13], 2), [10.3, 8.83, 9.7, 0.5, -0.37, -0.37]);
                    should.deepEqual(mathjs.round(calState[14], 2), [10.4, 8.6, 9.6, 0.5, -0.5, -0.5]);
                    should.deepEqual(mathjs.round(calState[15], 2), [10.5, 8.5, 9.5, 0.5, -0.5, -0.5]);
                }

                yield(frame.home().then(r => async.next(r)));
                var calPath = calibrationPath();
                var calState = [];
                for (var i = 0; i < calPath.length; i++) {
                    yield frame.moveTo(calPath[i]).then(r => async.next(r));
                    calState.push(frame.calibration.toActual(frame.state));
                }
                verifyCalibration(calState);

                // Deserialized DriveFrame is still calibrated
                var json = JSON.stringify(frame);
                delete frame;
                var frame2 = DriveFrame.fromJSON(json);
                yield(frame2.home().then(r => async.next(r)));
                var calPath = calibrationPath();
                var calState = [];
                for (var i = 0; i < calPath.length; i++) {
                    yield frame2.moveTo(calPath[i]).then(r => async.next(r));
                    calState.push(frame2.calibration.toActual(frame2.state));
                }
                verifyCalibration(calState);
                done();
            } catch (err) {
                winston.error(err);
            }
        }();
        async.next();
    })
})

