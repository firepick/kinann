var mathjs = require("mathjs");

(function(exports) { 
    class AStarGraph {
        constructor(options = {}) {
        }
        neighborsOf(node) {
            // NOTE: neighbors can be generated dynamically, but they must be unique
            throw new Error("neighborsOf(node) must be overridden by subclass");
        }
        estimateCost(node1, node2) {
            // estimatedCost must be admissible (i.e., less than or equal to actual cost)
            throw new Error("estimateCost(node1, node2) must be overridden by subclass");
        }
        findPath(start, goal, options) { // Implements A* algorithm
            var openSet = [start];
            var closedSet = [];
            var fScoreMap = {};
            var gScoreMap = {};
            var cameFrom = {};
            var cost = (n1,n2) => n1 === n2 ? 0 : this.estimateCost(n1, n2);
            var score = (node, nameScoreMap) => {
                var score = nameScoreMap[node];
                return score == null ? Number.MAX_SAFE_INTEGER : score;
            }

            fScoreMap[start.name] = cost(start, goal);
            gScoreMap[start.name] = 0;
            while (openSet.length) {
                options.onOpenSet && options.onOpenSet(openSet);
                openSet.sort((a,b) => score(a, fScoreMap) - score(b, fScoreMap));
                var current = openSet.shift();
                if (current === goal) {
                    var totalPath = [current];
                    while (cameFrom[current]) {
                        current = cameFrom[current];
                        totalPath.push(current);
                    }
                    return totalPath.reverse();
                }
                closedSet[current] = true;
                this.neighborsOf(current).forEach((neighbor) => {
                    if (!closedSet[neighbor]) {
                        var tentative_gScore = score(current, gScoreMap) + cost(current, neighbor);
                        if (!openSet[neighbor]) {
                            openSet[neighbor] = true;
                            openSet.push(neighbor);
                        } else if (tentative_gScore >= score(neighbor, gScoreMap)) {
                            neighbor = null;
                        }
                        if (neighbor) {
                            cameFrom[neighbor] = current;
                            gScoreMap[neighbor] = tentative_gScore;
                            fScoreMap[neighbor] = cost(neighbor, goal);
                        }
                    }
                });
            }
        }
    }

    module.exports = exports.AStarGraph = AStarGraph;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("AStarGraph", function() {
    var should = require("should");
    var AStarGraph = exports.AStarGraph;

    it("AStarGraph subclass finds shortest path", function() {
        var verbose = false;
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

        // extends AStarGrap with appropriate
        class TestGraph extends AStarGraph {
            constructor(costs, options) {
                super(options);
                this.costs = costs;
            }
            neighborsOf(node) { 
                return Object.keys(this.costs[node]);
            }
            estimateCost(n1, n2) {
                var neighborCost = n2 && this.costs[n1][n2]; // n2 is a neighbor of n1
                var minNeighborCost = () => { // n2 is not a neighbor of n1
                    var neighborCosts = this.costs[n1];
                    return Object.keys(neighborCosts).reduce(
                        (acc, name) => mathjs.min(acc, neighborCosts[name]),
                        Number.MAX_SAFE_INTEGER);
                }
                return neighborCost || minNeighborCost();
            }
        }

        var graph = new TestGraph(nodeCosts);
        graph.estimateCost("START", "END").should.equal(1);
        graph.estimateCost("START", "B").should.equal(3);

        // find shortest path (and print trace if required)
        var options = {
            onOpenSet: (openSet) => verbose && console.log("openSet", JSON.stringify(openSet))
        };
        var path = graph.findPath("START", "END", options); 
        should.deepEqual(path, ["START","B","B1","END"]);
    })
})
