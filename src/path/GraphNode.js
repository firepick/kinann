var AStarGraph = require("./AStarGraph");

(function(exports) { 
    
    class GraphNode {
        constructor(props) {
            props != null && Object.assign(this, props);
            Object.defineProperty(this, "cameFrom", {
                value: null, 
                writable: true,
            });
            Object.defineProperty(this, "isOpen", {
                value: null,
                writable: true,
            });
            Object.defineProperty(this, "isClosed", {
                value: null, 
                writable: true,
            });
            Object.defineProperty(this, "$f", {
                value: null, 
                writable: true,
            });
            Object.defineProperty(this, "$g", {
                value: null,
                writable: true,
            });
        }
        toJSON() {
            var obj = Object.assign({}, this);
            this.$f != null && (obj.f = this.$f);
            this.$g != null && (obj.g = this.$g);
            return obj;
        }
        get fscore() {
            return this.$f == null ? Number.MAX_SAFE_INTEGER : this.$f;
        }
        set fscore(value) {
            this.$f = value;
        }
        get gscore() {
            return this.$g == null ? Number.MAX_SAFE_INTEGER : this.$g;
        }
        set gscore(value) {
            this.$g = value;
        }
    }

    module.exports = exports.GraphNode = GraphNode;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("GraphNode", function() {
    const should = require("should");
    const GraphNode = exports.GraphNode;

    it("GraphNode(props) creates an AStarGraph node with given properties", function() {
        var node = new GraphNode({
            color: "purple",
        });
        JSON.stringify(node).should.equal('{"color":"purple"}');
    })
})
