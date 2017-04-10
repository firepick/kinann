var AStarGraph = require("./AStarGraph");

(function(exports) { 
    
    class GraphNode {
        constructor() {
            Object.defineProperty(this, "cameFrom", {
                value: null, // estimated cost
                writable: true,
            });
            Object.defineProperty(this, "isOpen", {
                value: null, // estimated cost
                writable: true,
            });
            Object.defineProperty(this, "isClosed", {
                value: null, // estimated cost
                writable: true,
            });
            Object.defineProperty(this, "f", {
                value: null, // estimated cost
                writable: true,
            });
            Object.defineProperty(this, "g", {
                value: null, // estimated cost
                writable: true,
            });
        }
    }

    module.exports = exports.GraphNode = GraphNode;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PathFactory", function() {
    var should = require("should");
})
