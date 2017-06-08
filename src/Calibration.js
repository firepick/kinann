(function(exports) {
    /**
     * A Calibration is a serializable approximation of a bijective mapping 
     * between a "nominal" space and an "actual" space.
     */
    class Calibration {
        constructor (model={}) {
            this.model = model;
            Object.defineProperty(this, "toNominal", { // not serializable
                enumerable: true,
                value: (state) => this.model_toNominal(this.model, state),
            });
            Object.defineProperty(this, "toActual", { // not serializable
                enumerable: true,
                value: (state) => this.model_toActual(this.model, state),
            });
        }

        model_toNominal(model, state) { 
            return state.map(v=>v);
        }

        model_toActual(model,state) { 
            return state.map(v=>v);
        }

        toJSON() {
            var obj = {
                type: "Calibration",
                model: this.model,
                model_toNominal: this.model_toNominal.toString(),
                model_toActual: this.model_toActual.toString(),
            }
            return obj;
        }

        static fromJSON(json) {
            json = typeof json === "string" ? JSON.parse(json) : json;
            if (json.type !== "Calibration") {
                return null;
            }
            var cal = new Calibration(json.model);
            function body(fjson) {
                var lbrace = fjson.indexOf("{");
                var rbrace = fjson.lastIndexOf("}");
                return fjson.substr(lbrace+1, rbrace-lbrace-1);
            }
            if (json.model_toNominal) {
                cal.model_toNominal = new Function('model', 'state', body(json.model_toNominal));
            }
            if (json.model_toActual) {
                cal.model_toActual = new Function('model','state', body(json.model_toActual));
            }
            return cal;
        }

        static isApproximately(state1,state2,e=0.01) {
            if (!(state1 instanceof Array)) {
                throw new Error("expected state Array");
            }
            if (!(state2 instanceof Array)) {
                throw new Error("expected state Array");
            }
            if (state1.length != state2.length) {
                throw new Error("expected state Arrays of equal length");
            }
            for (var i = 0; i < state1.length; i++) {
                var diff = state2[i] - state1[i];
                if ( diff < -e || e < diff) {
                    return false;
                }
            }
            return true;
        }

    } // class Calibration

    module.exports = exports.Calibration = Calibration;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Calibrate", function() {
    const should = require("should");
    //const Calibration = require("./Calibration");
    const Calibration = exports.Calibration;

    class TestCal extends Calibration { 
        constructor(scale=3) {
            super({scale});
        }
        model_toActual(model,state) { // serializable override
            return state.map(v => Math.exp(v/model.scale));
        }
        model_toNominal(model,state) { // serializable override
            return state.map(v => model.scale*Math.log(v));
        }
    }

    it('isApproximately(state1,state2,e) returns true if given states are approximately equal', function() {
        Calibration.isApproximately([1],[1]).should.equal(true);
        Calibration.isApproximately([1],[1.009],0.01).should.equal(true);
        Calibration.isApproximately([1],[1.011],0.01).should.equal(false);
        Calibration.isApproximately([1,2,3],[1,2,3]).should.equal(true);
        Calibration.isApproximately([1,2,3],[1,2,3.009]).should.equal(true);
        Calibration.isApproximately([1,2,3],[1,2,3.011]).should.equal(false);
        should.throws(() => Calibration.isApproximately([1],[1,2])); // unequal length
        should.throws(() => Calibration.isApproximately("a","b")); // not Array
    })
    it("A calibration provides bijections between actual and nominal state vectors", function() {
        // the identity calibration maps a space to itself
        var cal = new Calibration(); 
        var state = [1,0.5,0.3];
        should.deepEqual(state, cal.toNominal(cal.toActual(state))); 

        // actual calibrations are approximations within algorithm-dependent tolerance 
        var testCal = new TestCal(11);
        var tolerance = 1e-15;
        should(Calibration.isApproximately(state, testCal.toNominal(testCal.toActual(state)), tolerance)).true();
    });
    it("A calibration is serializable", function() {
        var cal1 = new TestCal(5);
        var someParentObj = {
            name: "a test object",
            myCal: cal1,
        };
        var sjson = JSON.stringify(someParentObj);
        var json = JSON.parse(sjson);
        var cal2 = Calibration.fromJSON(json.myCal);
        var state = [1,0.5,0.3];
        should.deepEqual(cal1.model, cal2.model);
        should.deepEqual(cal1.toNominal(state), cal2.toNominal(state));
        should.deepEqual(cal1.toActual(state), cal2.toActual(state));
        should.strictEqual(Calibration.fromJSON({type:"bad"}), null);
    });
})
