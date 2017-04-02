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
            constructor(name, neighbors) {
                this.name = name;
                this.neighbors = neighbors;
                this.from = [];
                this.fScore = Number.MAX_SAFE_INTEGER;
                this.gScore = Number.MAX_SAFE_INTEGER;
            }
        }
        var graph = {
            START: new Node("START", {
                A: 1, // huge hills
                B: 3, // optimal
                C: 2, // dead end
            }),
            A: new Node("A", { A1: 1, A2: 2, }),
            A1: new Node("A1", { END: 100, }),
            A2: new Node("A2", { END: 50, }),
            B: new Node("B", { B1: 3, }),
            B1: new Node("B1", { END: 3, }),
            C: new Node("C", { }),
            END: new Node("END", {}),
        }
        var hce = (n1,n2) => {
            if (n1 === graph.END) {
                return 0;
            }
            var edges = Object.keys(n1.neighbors);
            return edges.reduce((acc, edge) => {
                return mathjs.min(acc, n1.neighbors[edge]);
            }, 9999999);
        }
        hce(graph.START,graph.END).should.equal(1);
        hce(graph.B1,graph.END).should.equal(3);

        var closedSet = {};
        var openSet = [graph.START];
        var cameFrom = {};
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
                while (cameFrom[current.name]) {
                    current = cameFrom[current.name];
                    totalPath.push(current.name);
                }
                console.log("path", totalPath.reverse());
                break;
            }
            closedSet[current.name] = true;
            Object.keys(current.neighbors).forEach((neighborName) => {
                if (!closedSet[neighborName]) {
                    var distanceToNeighbor = current.neighbors[neighborName];
                    var tentative_gScore = current.gScore + distanceToNeighbor;
                    var neighbor = graph[neighborName];
                    if (!neighbor.isOpen) {
                        neighbor.isOpen = true;
                        openSet.push(neighbor);
                    } else if (tentative_gScore >= neighbor.gScore) {
                        neighbor = null;
                    }
                    if (neighbor) {
                        cameFrom[neighborName] = current;
                        neighbor.gScore = tentative_gScore;
                        neighbor.fScore = hce(neighbor, graph.END);
                    }
                }
            });
        }
    })
})
