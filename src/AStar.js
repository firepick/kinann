var mathjs = require("mathjs");

(function(exports) { 
    class AStarNode {
        constructor(name, neighborsOf) {
            this.name = name;
            this.neighborsOf = neighborsOf;
            this.from = [];
        }
        neighbors() {
            return this.$neighbors || (this.$neighbors = this.neighborsOf(this));
        }
        score(fScoreMap) {
            var score = fScoreMap[this.name];
            return score == null ? Number.MAX_SAFE_INTEGER : score;
        }
        pathTo(goal, estimateCost) {
            var openSet = [this];
            var fScoreMap = {};
            var gScoreMap = {};
            fScoreMap[this.name] = estimateCost(this, goal);
            gScoreMap[this.name] = 0;
            while (openSet.length) {
                openSet.sort((a,b) => a.score(fScoreMap) - b.score(fScoreMap));
                console.log("openSet", openSet.map((node) => node.name));
                var current = openSet.shift();
                current.isOpen = false;
                if (current === goal) {
                    totalPath = [current];
                    while (current.cameFrom) {
                        current = current.cameFrom;
                        totalPath.push(current);
                    }
                    return totalPath;
                }
                current.isClosed = true;
                current.neighbors().forEach((neighbor) => {
                    if (!neighbor.isClosed) {
                        var tentative_gScore = current.score(gScoreMap) + estimateCost(current, neighbor);
                        if (!neighbor.isOpen) {
                            neighbor.isOpen = true;
                            openSet.push(neighbor);
                        } else if (tentative_gScore >= neighbor.score(gScoreMap)) {
                            neighbor = null;
                        }
                        if (neighbor) {
                            neighbor.cameFrom = current;
                            gScoreMap[neighbor.name] = tentative_gScore;
                            fScoreMap[neighbor.name] = estimateCost(neighbor, goal);
                        }
                    }
                });
            }
        }
    }

    module.exports = exports.AStarNode = AStarNode;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("AStarNode", function() {
    var should = require("should");
    var AStarNode = exports.AStarNode;

    it("graph", function() {
        var costs = {
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
        var graph = {};
        function neighborsOf(node) {
            var nodeCosts = costs[node.name];
            var neighbors = [];
            Object.keys(nodeCosts).forEach((name) => {
                var neighbor = graph[name];
                if (!neighbor) {
                    neighbor = graph[name] = new AStarNode(name, neighborsOf);
                }
                neighbors.push(neighbor);
            });
            return neighbors;
        }

        graph.START = new AStarNode("START", neighborsOf);
        graph.END = new AStarNode("END", neighborsOf);

        var costHeuristic = (n1, n2) => {
            if (n1 === n2) {
                return 0;
            }
            n1.neighbors();
            var nodeCost = costs[n1.name];
            if (nodeCost) {
                var cost = n2 && nodeCost[n2.name];
                if (cost == null) {
                    cost = Object.keys(nodeCost).reduce(
                        (acc, name) => mathjs.min(acc, nodeCost[name]),
                        Number.MAX_SAFE_INTEGER
                    )
                }
            } else {
                var cost = Number.MAX_SAFE_INTEGER;
            }
            return cost;
        }
        costHeuristic(graph.START,graph.END).should.equal(1);
        costHeuristic(graph.B,graph.B1).should.equal(3);
        costHeuristic(graph.B1,graph.END).should.equal(3);

        var path = graph.START.pathTo(graph.END, costHeuristic);
        console.log("path", path.map((node) => node.name));
    })
})
