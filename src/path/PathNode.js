var GraphNode = require("./GraphNode");

(function(exports) { 
    class PathNode extends GraphNode{
        constructor(position, velocity, acceleration) {
            super();
            this.s = position;
            this.v = velocity || Array(position.length).fill(0);
            this.a = acceleration || Array(position.length).fill(0);
            Object.defineProperty(this, "key", {
                value: JSON.stringify(this)
            });
            Object.defineProperty(this, "h", {
                value: null, // estimated cost
                writable: true,
                enumerable: true,
            });
        }

        toJSON() {
            var obj = super.toJSON();
            obj.f && (obj.f = ((obj.f * 100 + 0.5)|0)/100);
            return obj;
        }
    }

    module.exports = exports.PathNode = PathNode;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PathNode", function() {
    var should = require("should");
})
