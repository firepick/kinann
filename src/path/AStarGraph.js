var mathjs = require("mathjs");
var GraphNode = require("./GraphNode");

(function(exports) { 
    class AStarGraph {
        constructor(options = {}) {
            this.maxIterations = options.maxIterations || 10000;
            this.fastOpenSize = options.fastOpenSize || 8;
            this.stats = {};
        }
        neighborsOf(node, goal) {
            // NOTE: neighbors can be generated dynamically, but they must be unique
            throw new Error("neighborsOf(node) must be overridden by subclass");
        }
        cost(node1, node2) {
            // actual cost 
            throw new Error("cost(node1, node2) must be overridden by subclass");
        }
        estimateCost(node1, goal) {
            // estimatedCost must be admissible (i.e., less than or equal to actual cost)
            throw new Error("estimateCost(node1, goal) must be overridden by subclass");
        }
        findMinOpen() {
            var fScore = Number.MAX_SAFE_INTEGER;
            var result = this.fastOpen.reduce((acc,node) => {
                if (node.isOpen && node.fscore <= fScore ) {
                    fScore = node.fscore;
                    return node;
                }
                return acc;
            }, null);
            if (result == null) {
                this.stats.findPath.sort++;
                this.slowOpen.sort((a,b) => b.fscore - a.fscore);
                this.fastOpenMax = 0;
                this.fastOpen = [];
                var node;
                while (this.fastOpen.length < this.fastOpenSize && (node = this.slowOpen.pop())) {
                    if (node.isOpen) {
                        this.fastOpenMax = node.fscore;
                        this.fastOpen.push(node);
                    }
                }
                var result = this.fastOpen.reduce((acc,node) => {
                    if (node.isOpen && node.fscore <= fScore ) {
                        fScore = node.fscore;
                        return node;
                    }
                    return acc;
                }, null);
                if (result == null) {
                    throw new Error("findMinOpen FAIL:"+this.fastOpen.length+" "+this.slowOpen.length);
                }
            }

            return result;
        }
        pathTo(node) {
            var totalPath = [node];
            while ((node = node.cameFrom)) {
                totalPath.push(node);
            }
            return totalPath.reverse();
        }
        findPath(start, goal, options) { 
            // Implements A* algorithm
            var msStart = new Date();
            this.fastOpen = [start];
            this.slowOpen = [];
            var onCurrent = options.onCurrent || ((node)=>true);
            var onCull = options.onCull || ((node,gscore_new) => null);
            start.fscore = this.estimateCost(start, goal);
            start.gscore = 0;
            start.isOpen = true;
            var stats = this.stats.findPath = {
                iter: 0,
                nodes: 0,
                fast: 0,
                slow: 0,
                sort: 0,
            };
            var path = [];
            this.fastOpenMax = start.fscore;
            while (stats.iter++ < this.maxIterations) {
                var current = this.findMinOpen();
                if (current == null) {
                    break;
                }
                if (!onCurrent(current)) {
                    break;
                }
                if (current === goal) {
                    path = this.pathTo(current);
                    break;
                }
                current.isOpen = false;
                current.isClosed = true;
                for (var neighbor of this.neighborsOf(current, goal)) {
                    stats.nodes++;
                    if (neighbor.isClosed) {
                        continue;
                    }
                    var tentative_gScore = current.gscore + this.cost(current, neighbor);
                    if (neighbor.isOpen && tentative_gScore >= neighbor.gscore) {
                        onCull(neighbor, tentative_gScore);
                        continue;
                    }
                    neighbor.cameFrom = current;
                    neighbor.gscore = tentative_gScore;
                    neighbor.fscore = neighbor.gscore + this.estimateCost(neighbor, goal);
                    if (!neighbor.isOpen) {
                        neighbor.isOpen = true;
                        if (this.fastOpen.length === 0 || neighbor.fscore < this.fastOpenMax) {
                            this.fastOpen.push(neighbor);
                            this.fastOpenMax = mathjs.max(this.fastOpenMax, neighbor.fscore);
                            stats.fast++;
                        } else {
                            this.slowOpen.push(neighbor);
                            stats.slow++;
                        }
                    }
                }
            }
            stats.ms = new Date() - msStart;
            stats.fastOpen = this.fastOpen.length;
            stats.slowOpen = this.slowOpen.length;
            stats.path = path.length;
            return {
                path: path,
                stats: stats,
            }
        }
    }

    module.exports = exports.AStarGraph = AStarGraph;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("AStarGraph", function() {
    var should = require("should");
    var AStarGraph = exports.AStarGraph;

    it("AStarGraph subclass finds shortest path", function() {
        var verbose = 0;
        // define a simple graph with weighted transitions between named nodes
        var nodeCosts = {
            START: {
                A: 1, // huge hills
                B: 3, // optimal
                C: 2, // dead end
            },
            A: { A1: 1, A2: 2, },
            A1: { END: 100, },
            A2: { END: 50, },
            B: { B1: 3, },
            B1: { END: 3, },
            C: { },
            END: { },
        }
        var nodes = {};
        Object.keys(nodeCosts).forEach((name) => nodes[name] = new GraphNode({name:name}));

        // extends AStarGrap with appropriate
        class TestGraph extends AStarGraph {
            constructor(costs, options) {
                super(options);
                this.costs = costs;
            }
            neighborsOf(node, goal) { 
                return Object.keys(this.costs[node.name]).map((name) => nodes[name]);
            }
            cost(n1, n2) {
                var neighborCost = n2 && this.costs[n1.name][n2.name]; // n2 is a neighbor of n1
                if (!neighborCost) {
                    throw new Error("cannot compute cost to non-neighbor");
                }
                return neighborCost;
            }
            estimateCost(n1, goal) {
                if (n1 === goal) {
                    return 0;
                }
                var neighborCost = goal && this.costs[n1.name][goal.name]; // goal is a neighbor of n1
                var minNeighborCost = () => { // if goal is not a neighbor of n1
                    // compute cost as minimum cost of n1 to its neighbors
                    var neighborCosts = this.costs[n1.name];
                    return Object.keys(neighborCosts).reduce(
                        (acc, name) => mathjs.min(acc, neighborCosts[name]),
                        Number.MAX_SAFE_INTEGER);
                }
                return neighborCost || minNeighborCost();
            }
        }

        var graph = new TestGraph(nodeCosts);
        var START = nodes.START;
        var A = nodes.A;
        var A1 = nodes.A1;
        var A2 = nodes.A2;
        var B = nodes.B;
        var B1 = nodes.B1;
        var END = nodes.END;
        graph.estimateCost(START, END).should.equal(1);
        graph.estimateCost(START, B).should.equal(3);
        graph.cost(A2, END).should.equal(50);
        graph.estimateCost(A2, END).should.equal(50);

        var options = {
            onCurrent: (current) => { // called whenever current node changes
                if (verbose) {
                    console.log(JSON.stringify(current),
                        "f:"+current.fscore,
                        "g:"+current.gscore,
                        ""); 
                }
                return true;
            },
            onCull: (node, gscore_new) => { // called whenever a node is rejected
                if (verbose) {
                    console.log("culling", JSON.stringify(node), gscore_new, node.gscore);
                }
                return null;
            },
        };
        var path = graph.findPath(START, END, options).path; 
        should.deepEqual(path.map((n) => n.name), ["START","B","B1","END"]);
    })
    it("TESTTESTpush/pop are faster than unshift/shift", function() {
        var start = {color: "purple"};
        var msStart = new Date();
        for (var i=0; i<100; i++) {
            var a = [];
            for (var j=0; j<1000; j++) {
                a.push(start);
            }
            for (var j=0; j<1000; j++) {
                a.pop();
            }
        }
        var msElapsedPush = new Date() - msStart;

        var a = [];
        var msStart = new Date();
        for (var i=0; i<200; i++) {
            var a = [];
            for (var j=0; j<1000; j++) {
                a.unshift(start);
            }
            for (var j=0; j<1000; j++) {
                a.shift();
            }
        }
        var msElapsedUnshift = new Date() - msStart;
        msElapsedPush.should.below(msElapsedUnshift/2);
    })
})
