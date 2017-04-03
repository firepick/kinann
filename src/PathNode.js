var mathjs = require("mathjs");
var AStarNode = require("./AStarNode");

(function(exports) { 
    class PathNode extends AStarNode {
        constructor(name, pos, velocity) {
            super(name);
            this.pos = pos;
            this.velocity = velocity || Array(pos.length).fill(0);
        }
        normSquaredTo(node2) {
            return mathjs.subtract(this.pos, node2.pos).reduce((sum, diff) => sum + diff * diff, 0);
        }
        static estimateCost(n1, n2) {
            return n1.normSquaredTo(n2);
        }
    }

    module.exports = exports.PathNode = PathNode;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PathNode", function() {
    var should = require("should");
    var PathNode = exports.PathNode;

    it("PathNode(name, pos, velocity) is the constructor", function() {
        var n1 = new PathNode("N1", [1,1,1]);
        should.deepEqual(n1.velocity, [0,0,0]); // default velocity is zero
        var n2 = new PathNode("N2", [1,1,1], [1,2,3]);
        should.deepEqual(n2.velocity, [1,2,3]);
    });
    it("normSquaredTo(node) returns the square of the distance to given node", function() {
        var n1 = new PathNode("N1", [1,1,1]);
        var n2 = new PathNode("N2", [3,3,3]);
        n1.normSquaredTo(n2).should.equal(12);  
        n2.normSquaredTo(n1).should.equal(12);  
    })
    it("estimateCost(n1,n2) estimates the cost to move between the given nodes", function() {
        var n1 = new PathNode("N1", [1,3,2]);
        var n2 = new PathNode("N2", [3,1,4]);
        PathNode.estimateCost(n1,n2).should.equal(12);  
    })
})
