(function(exports) {

    ////////////////// constructor
    function Variable(minVal=0, maxVal) {
        var that = this;
        maxVal != null || (maxVal = minVal);
        that.max = minVal < maxVal ? maxVal : minVal;
        that.min = minVal < maxVal ? minVal : maxVal;
        return that;
    }

    module.exports = exports.Variable = Variable;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Variable", function() {
    var should = require("should");
    var Variable = exports.Variable;

    it("Variable(v1,v2) defines an ANN variable over [v1,v2]", function() {
        new Variable(30,1).should.properties({
            min: 1,
            max: 30,
        });
        new Variable(1).should.properties({
            min: 1,
            max: 1,
        });
        new Variable().should.properties({
            min: 0,
            max: 0,
        });
    })
})
