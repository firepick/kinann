var mathjs = require("mathjs");
var GraphNode = require("./GraphNode");

(function(exports) { 
    class AStarGraph {
        constructor(options = {}) {
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
        cameFrom(node, value) {
            if (value == null) {
                return node.$cameFrom;
            }
            return node.$cameFrom = value;
        }
        isOpen(node, value) {
            if (value == null) {
                return node.$isOpen;
            }
            return node.$isOpen = value;
        }
        isClosed(node, value) {
            if (value == null) {
                return node.$isClosed;
            }
            return node.$isClosed = value;
        }
        fscore(node, value) {
            if (value == null) {
                return node.$f == null ? Number.MAX_SAFE_INTEGER : node.$f;
            }
            node.$f = value;
        }
        gscore(node, value) {
            if (value == null) {
                return node.$g == null ? Number.MAX_SAFE_INTEGER : node.$g;
            }
            node.$g = value;
        }
        candidate(openSet) {
            var fScore = Number.MAX_SAFE_INTEGER;
            var result = openSet.reduce((acc,node) => {
                var f = this.fscore(node);
                if (f == null) {
                    throw new Error("fscore null for node:" + JSON.stringify(node));
                }
                if (this.fscore(node) <= fScore ) {
                    fScore = this.fscore(node); 
                    return node;
                }
                return acc;
            }, null);
            if (result == null) {
                throw new Error("candidate FAIL:" + JSON.stringify(openSet));
            }

            return result;
        }
        pathTo(node) {
            var totalPath = [node];
            while ((node = this.cameFrom(node))) {
                totalPath.push(node);
            }
            return totalPath.reverse();
        }
        findPath(start, goal, options) { // Implements A* algorithm
            this.openSet = [start];
            var onOpenSet = options.onOpenSet || (()=>true);
            var onCull = options.onCull || ((node,gscore_new,gscore_existing) => null);
            this.fscore(start, this.estimateCost(start, goal));
            this.gscore(start, 0);
            while (this.openSet.length && onOpenSet(this.openSet)) {
                var current = this.candidate(this.openSet);
                if (current === goal) {
                    return this.pathTo(current);
                }
                this.isOpen(current, false);
                this.isClosed(current, true);
                for (var neighbor of this.neighborsOf(current, goal)) {
                    if (!this.isClosed(neighbor)) {
                        var tentative_gScore = this.gscore(current) + this.cost(current, neighbor);
                        if (this.isOpen(neighbor)) {
                            if (tentative_gScore >= this.gscore(neighbor)) {
                                neighbor = onCull(neighbor, tentative_gScore, this.gscore(neighbor));
                            }
                        } else {
                            this.isOpen(neighbor, true);
                            this.openSet.push(neighbor);
                        }
                        if (neighbor) {
                            var h = this.estimateCost(neighbor, goal);
                            this.cameFrom(neighbor, current);
                            this.gscore(neighbor, tentative_gScore);
                            this.fscore(neighbor, this.gscore(neighbor) + h);
                        }
                    }
                };
                this.openSet = this.openSet.reduce(
                    (acc, node) => (this.isOpen(node) && acc.push(node), acc),
                    []);
            }
            return []; // no path
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

        // find shortest path. If provided, onOpenSet() can be used
        // to trace each iteration or halt search by returning false
        var options = {
            onOpenSet: (openSet) => {
                if (verbose) {
                    var current = graph.candidate(openSet);
                    console.log("openSet", JSON.stringify(openSet.map((node) => node.name)),
                        "gcost", graph.gscore(current),
                        "fcost", graph.fscore(current)
                        ); 
                }
                return true;
            },
            onCull: (node, gscore_new, gscore_existing) => {
                if (verbose) {
                    console.log("culling", JSON.stringify(node), gscore_new, gscore_existing);
                }
                return null;
            },
        };
        var path = graph.findPath(START, END, options); 
        should.deepEqual(path.map((n) => n.name), ["START","B","B1","END"]);
    })
})
