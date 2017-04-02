var mathjs = require("mathjs");

(function(exports) { class AStar {
    constructor() {
        this.queue = [];
    }

} //// CLASS

    module.exports = exports.AStar = AStar;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("AStar", function() {
    var should = require("should");

    it("graph", function() {
        class Node {
            constructor(name, fneighbors) {
                this.name = name;
                this.fneighbors = fneighbors;
                this.from = [];
                this.fScore = Number.MAX_SAFE_INTEGER;
                this.gScore = Number.MAX_SAFE_INTEGER;
            }
            neighbors() {
                return this.$neighbors || (this.$neighbors = fneighbors(this.name));
            }
        }
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
            END: {},
        }
        var graph = {};
        function fneighbors(name) {
            var nodeCosts = costs[name];
            var neighbors = [];
            Object.keys(nodeCosts).forEach((name) => {
                var neighbor = graph[name];
                if (!neighbor) {
                    neighbor = graph[name] = new Node(name, fneighbors);
                }
                neighbors.push(neighbor);
            });
            return neighbors;
        }
        graph.START = new Node("START", fneighbors);
        graph.END = new Node("END", fneighbors);
        var hce = (n1,n2) => {
            if (n1 === graph.END) {
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
        hce(graph.START,graph.END).should.equal(1);
        hce(graph.B,graph.B1).should.equal(3);
        hce(graph.B1,graph.END).should.equal(3);

        var openSet = [graph.START];
        graph.START.fScore = hce(graph.START,graph.END);
        graph.START.gScore = 0;
        while (openSet.length) {
            openSet.sort((a,b) => a.fScore - b.fScore);
            console.log("openSet", openSet.map((node) => node.name));
            var current = openSet.shift();
            current.isOpen = false;
            //console.log("current", current.name, openSet.map((node) => node.name));
            if (current.name === "END") {
                totalPath = [current.name];
                while (current.cameFrom) {
                    current = current.cameFrom;
                    totalPath.push(current.name);
                }
                console.log("path", totalPath.reverse());
                break;
            }
            current.isClosed = true;
            current.neighbors().forEach((neighbor) => {
                if (!neighbor.isClosed) {
                    var tentative_gScore = current.gScore + hce(current, neighbor);
                    if (!neighbor.isOpen) {
                        neighbor.isOpen = true;
                        openSet.push(neighbor);
                    } else if (tentative_gScore >= neighbor.gScore) {
                        neighbor = null;
                    }
                    if (neighbor) {
                        neighbor.cameFrom = current;
                        neighbor.gScore = tentative_gScore;
                        neighbor.fScore = hce(neighbor, graph.END);
                    }
                }
            });
        }
    })
})
