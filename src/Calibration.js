(function(exports) {
    /**
     * A Calibration is a serializable approximation of a bijective mapping 
     * between a "nominal" space and an "actual" space.
     */
    class Calibration {
        constructor (model={}) {
            this.type = "Calibration";
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
                type: this.type,
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
