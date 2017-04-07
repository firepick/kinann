var mathjs = require("mathjs");
var AStarGraph = require("./AStarGraph");

(function(exports) { 
    
    class PathNode {
        constructor(position, velocity, acceleration) {
            this.s = position;
            this.v = velocity || Array(position.length).fill(0);
            this.a = acceleration || Array(position.length).fill(0);
        }
    }

    class Pathfinder extends AStarGraph {
        constructor(options={}) {
            super(options);
            this.dimensions = options.dimensions || 1;
            this.vMax = options.maxVelocity || Array(this.dimensions).fill(10);
            this.aMax = options.maxAcceleration || Array(this.dimensions).fill(2);
            this.jMax = options.maxJerk || Array(this.dimensions).fill(1);
            this.a0 = Array(this.dimensions).fill(0);
            this.goalDistSquared = this.jMax.reduce((sum, j) => sum + j*j, 0);
            this.nodeMap = {};
            this.stopTimes = {};
        }
        getNode(position, velocity, acceleration) {
            var node = new PathNode(position, velocity, acceleration);
            var key = JSON.stringify(node);
            return (this.nodeMap[key] = this.nodeMap[key] || node);
        }
        axisAccelerations(node, i) {
            Pathfinder.validateNode(node);
            var av = [];
            var a = node.a[i];
            var v = node.v[i];
            var vMax = this.vMax[i];
            var aMax = this.aMax[i];
            var jMax = this.jMax[i];
            var aplus = a + jMax;
            var aminus = a - jMax;
            if (a < aMax && -vMax <= v+aplus && v+aplus <= vMax) {
                av.push(mathjs.min(aMax, a+jMax));
            }
            if (-vMax <= a+v && -vMax <= a+v && a+v <= vMax) {
                av.push(a);
            }
            if (-aMax < a && -vMax <= v+aminus && v+aminus <= vMax) {
                av.push(mathjs.max(-aMax, a-jMax));
            }
            return av;
        }
        static validateNode(node) {
            if (!(node instanceof PathNode)) {
                throw new Error("Expected neigbhorsOf(?PathNode?,...)");
            }
            return node;
        }
        isGoalNeighbor(node, goal) { // a goal is zero-velocity
            for (var i = 0; i < this.dimensions; i++) {
                var jMax = this.jMax[i];
                var ds = goal.s[i] - node.s[i];
                var v = node.v[i];
                var dv = 0 - v;
                var a = node.a[i];
                var isNear = -2*jMax < ds && ds < 2*jMax;

                if (ds < -jMax || jMax < ds) {
                    isNear && console.log("too far", JSON.stringify(node));
                    return false; // too far
                }
                if (v < -jMax || jMax < v) {
                    isNear && console.log("too fast", JSON.stringify(node));
                    return false; // too fast
                }
                if (a < -jMax || jMax < a) {
                    isNear && console.log("too jerky", JSON.stringify(node));
                    return false; // too jerky
                }
                if (v < 0 && ds > 0 || v > 0 && ds < 0) {
                    isNear && console.log("wrong way", JSON.stringify(node));
                    return false; // wrong way velocity
                }
                if (dv > 0 && a < 0 || dv < 0 && a > 0) {
                    return false; // wrong way acceleration
                }
            }
            return true;
        }
        neighborsOf(node, goal) {
            Pathfinder.validateNode(node);
            if (goal && this.isGoalNeighbor(node, goal)) {
                return [goal];
            }
            var anewbasis = node.a.map((a,i) => this.axisAccelerations(node, i));
            var apermutations = Pathfinder.permutations(anewbasis).map((anew) => {
                var avariation = anew;
                var vvariation = mathjs.add(node.v,avariation);
                var svariation = mathjs.add(node.s,vvariation);
                return this.getNode(svariation, vvariation, avariation, node);
            });
            return apermutations;
        }
        cost(n1, n2, goal) {
            if (goal) {
                var dsgoal = mathjs.subtract(goal.s, n2.s);
                var toofast = dsgoal.reduce((acc,ds,i) => {
                    var dv2 = n2.v[i];
                    var dsiabs = mathjs.abs(ds);
                    return acc || (dsiabs > this.jMax[i] && mathjs.abs(n2.v[i]) > dsiabs);
                }, false);
                if (toofast) {
                    console.log("cost too fast", JSON.stringify(n2));
                    return Number.MAX_SAFE_INTEGER;
                }
            }
            return 1;
        }
        tsdv(v1, v2, jerk) { // time and distance for change in velocity
            if (v1 === v2) {
                return {
                    t: 0,
                    s: 0,
                }
            }
            if (v1 < 0) {
                if (v2 < 0) {
                    return this.tsdv(-v1, -v2, jerk);
                } else {
                    var r1 = this.tsdv(0, -v1, jerk);
                    var r2 = this.tsdv(0, v2, jerk);
                    return {
                        t: r1.t + r2.t,
                        s: r2.s + r2.s,
                    }
                }
            }
            if (v2 < 0) {
                var r1 = this.tsdv(0, v1, jerk);
                var r2 = this.tsdv(0, -v2, jerk);
                return {
                    t: r1.t + r2.t,
                    s: r2.s + r2.s,
                }
            }
            if (v2 < v1) {
                return this.tsdv(v2, v1, jerk);
            }
            var dv = v2 - v1;
            var t = -0.5 + mathjs.sqrt(0.25 + 2 * dv / jerk); // dv = jerk * t * (t + 1) / 2
            var s = t * (v1 + jerk * t * ( t / 6 + 0.5*jerk));
            return {
                t: t,
                s: s,
            }
        }
        estimateCost(n1, n2) {
            var ds = mathjs.subtract(n2.s, n1.s);
            var vts = n1.v.map((v1, i) => this.tsdv(v1, n2.v[i], this.jMax[i]));
            var t = vts.map((ts,i) => { // transition time + cruise time
                var v1 = n1.v[i];
                var v2 = n2.v[i];
                var dvi = v2 - v1;
                var dsi = ds[i];

                if (dsi === 0 && v2 !== v1) {
                    n1.culled = "velocity change without moving";
                    return Number.MAX_SAFE_INTEGER; // can't changing velocity without moving
                }
                var dsiabs = mathjs.abs(dsi);
                if (dsiabs > this.jMax[i] && mathjs.abs(n1.v[i]) > dsiabs) {
                    n1.culled = "too fast";
                    return Number.MAX_SAFE_INTEGER; // too fast
                }
                if (v1 === 0 && n1.a[i] || v2 === 0 && n2.a[i]) {
                    n1.culled = "stopping mid path";
                    //return Number.MAX_SAFE_INTEGER; // no stopping
                }
                var scruise = dsiabs - ts.s;
                if (v1 < 0 && dsi > 0 || v1 > 0 && dsi < 0) {
                    scruise += mathjs.abs(v1); // backtrack penalty (not exact)
                }
                if (scruise <= 0) {
                    return ts.t;
                }
                if (v1 == 0) {
                    return scruise / (v2 ? mathjs.abs(v2) : this.jMax[i]); 
                }
                return ts.t + scruise / mathjs.abs(v1);
            });
            return mathjs.max(t);
        }
        static get PathNode() {
            return PathNode;
        }
        static permutations(vv) {
            var vvelts = vv.reduce((acc, e) => e == null || !e.length ? 0:(acc+1), 0);
            if (vv.length !== vvelts) {
                return [];
            }
            function * variations() {
                var vi = Array(vv.length).fill(0);
                for(;;) {
                    yield vv.map((v,i) => v[vi[i]]);
                    for (var i = 0; i < vv.length; i++) {
                        if (++vi[i] < vv[i].length) {
                            break;
                        }
                        vi[i] = 0;
                        if (i+1 >= vv.length) {
                            return; 
                        }
                    }
                } 
            }
            return Array.from(variations());
        }
    }

    module.exports = exports.Pathfinder = Pathfinder;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("Pathfinder", function() {
    var should = require("should");
    var Pathfinder = exports.Pathfinder;
    var PathNode = Pathfinder.PathNode;

    it("Pathfinder(options) is the constructor", function() {
    })
    it("PathNode(name, pos, velocity) is the constructor", function() {
        var n1 = new PathNode([1,1,1]);
        should.deepEqual(n1.v, [0,0,0]); // default velocity is zero
        var n2 = new PathNode([1,1,1], [1,2,3]);
        should.deepEqual(n2.v, [1,2,3]);
    });
    it("estimateCost(n1,n2) estimates the cost to move between the given nodes", function() {
        var vmax = 10;
        var jmax = 1;

        var pf = new Pathfinder({
            dimensions: 1,
            maxAcceleration: [5],
            maxVelocity: [vmax],
            maxJerk: [jmax],
        });
        var goal = new PathNode([-10.1]);
        var node = new PathNode([-10],[-1]);
        pf.estimateCost(node,goal).should.approximately(1.1, 0.1);

        var pf = new Pathfinder({
            dimensions: 3,
            maxAcceleration: [5,5,5],
            maxVelocity: [vmax, vmax, vmax],
            maxJerk: [1,1,1],
        });
        var n1 = new PathNode([1,3,2]);
        var n2 = new PathNode([3,1,4]);
        pf.estimateCost(n1,n2).should.equal(2/jmax);
    })
    it("getNode(s,v,a) returns unique node with given attributes", function() {
        var pf = new Pathfinder({
            dimensions: 2,
        });
        var n1 = pf.getNode([1,2],[3,4],[5,6]);
        var n2 = pf.getNode([1,2],[3,4],[5,6]);
        n1.should.equal(n2);
        n1.should.instanceOf(PathNode);
    })
    it("axisAccelerations(node, i) returns possible neighbor accelerations", function() {
        var pf = new Pathfinder({
            dimensions: 2,
            maxVelocity: [10, 100],
            maxAcceleration: [4, 5],
            maxJerk: [1, 2],
        });
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[0,0],[0,1]), 0), [1,0,-1]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[0,0],[1,1]), 0), [2,1,0]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[0,0],[4,1]), 0), [4,3]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[0,0],[-4,1]), 0), [-3,-4]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[10,0],[0,0]), 0), [0,-1]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[-10,0],[0,0]), 0), [1,0]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[10,0],[1,0]), 0), [0]);
        should.deepEqual(pf.axisAccelerations(pf.getNode([0,0],[-10,0],[-2,0]), 0), []);
    })
    it("permutations(vv) generates permutations", function() {
        should.deepEqual(Pathfinder.permutations([[1,2],[3,4,5]]), [
            [1,3],
            [2,3],
            [1,4],
            [2,4],
            [1,5],
            [2,5],
        ]);
        should.deepEqual(Pathfinder.permutations([[1,2],[],[3,4,5]]), []);
    })
    it("neighborsOf(node) generates node neighbors", function() {
        var pf = new Pathfinder({
            dimensions: 2,
        });

        var goal = new PathNode([-10.1,-10.1]);
        var node = new PathNode([-10,-10],[-1,-1]);
        var neighbors = pf.neighborsOf(node, goal);
        neighbors.length.should.equal(1);

        var start = new PathNode([1,1]);
        var neighbors = pf.neighborsOf(start);
        neighbors.length.should.equal(9);
        neighbors[0].should.equal(pf.getNode([2,2],[1,1],[1,1]));
        neighbors[1].should.equal(pf.getNode([1,2],[0,1],[0,1]));
        neighbors[2].should.equal(pf.getNode([0,2],[-1,1],[-1,1]));
        neighbors[8].should.equal(pf.getNode([0,0],[-1,-1],[-1,-1]));

        var node = new PathNode([1,1],[1,1],[1,1]);
        var neighbors = pf.neighborsOf(node);
        neighbors[0].should.equal(pf.getNode([4,4],[3,3],[2,2]));
        neighbors[1].should.equal(pf.getNode([3,4],[2,3],[1,2]));
        neighbors[2].should.equal(pf.getNode([2,4],[1,3],[0,2]));
        neighbors[3].should.equal(pf.getNode([4,3],[3,2],[2,1]));
        neighbors[4].should.equal(pf.getNode([3,3],[2,2],[1,1]));
        neighbors[5].should.equal(pf.getNode([2,3],[1,2],[0,1]));
        neighbors[6].should.equal(pf.getNode([4,2],[3,1],[2,0]));
        neighbors[7].should.equal(pf.getNode([3,2],[2,1],[1,0]));
        neighbors[8].should.equal(pf.getNode([2,2],[1,1],[0,0]));
        neighbors.length.should.equal(9);

    })
    it("isGoalNeighbor(node, goal) returns true if goal is reachable in one step from node", function() {
        var pf = new Pathfinder({
            dimensions: 2,
            maxVelocity: [100,100],
            maxAcceleration: [2,2],
            maxJerk: [1,1],
        });
        var goal = new PathNode([-10.1,-10.1]);
        var node = new PathNode([-10,-10],[-1,-1]);
        pf.isGoalNeighbor(node, goal).should.equal(true);

        var goal = new PathNode([1,1]);
        pf.isGoalNeighbor(goal, goal).should.equal(true);

        pf.isGoalNeighbor(pf.getNode([0,0]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.getNode([2,0]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.getNode([2,2]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.getNode([0,2]), goal).should.equal(true);

        pf.isGoalNeighbor(pf.getNode([0,0],[1,1]), goal).should.equal(true); // can stop
        pf.isGoalNeighbor(pf.getNode([2,2],[-1,-1]), goal).should.equal(true); // can stop
        pf.isGoalNeighbor(pf.getNode([0,0],[1.1,1.1]), goal).should.equal(false); // too fast
        pf.isGoalNeighbor(pf.getNode([0,0],[-1.1,-1.1]), goal).should.equal(false); // too fast
        pf.isGoalNeighbor(pf.getNode([0,0],[1,1],[-1,-1]), goal).should.equal(true); // can decelerate
        pf.isGoalNeighbor(pf.getNode([2,2],[-1,-1],[1,1]), goal).should.equal(true); // can decelerate
        pf.isGoalNeighbor(pf.getNode([0,0],[1,1],[-1.1,-1.1]), goal).should.equal(false); // too jerky
        pf.isGoalNeighbor(pf.getNode([2,2],[1,1],[1.1,1.1]), goal).should.equal(false); // too jerky
        pf.isGoalNeighbor(pf.getNode([0,0],[-1,-1]), goal).should.equal(false); // wrong velocity direction
        pf.isGoalNeighbor(pf.getNode([2,2],[1,1]), goal).should.equal(false); // wrong velocity direction
        pf.isGoalNeighbor(pf.getNode([0,0],[1,1],[1,1]), goal).should.equal(false); // wrong acceleration direction
        pf.isGoalNeighbor(pf.getNode([2,2],[-1,-1],[-1,-1]), goal).should.equal(false); // wrong acceleration direction
    })
    it("neighborsOf(node, goal) generates goal node if near", function() {
        var pf = new Pathfinder({
            dimensions: 2,
        });
        var goal = new PathNode([1,1]);
        var neighbors = pf.neighborsOf(goal);
        neighbors.forEach((n) => {
            var vinverse = mathjs.multiply(-1, n.v);
            var ninverse = pf.getNode(n.s, vinverse); 
            var nn = pf.neighborsOf(ninverse, goal);
            nn.length.should.equal(1, JSON.stringify(n));
            nn[0].should.equal(goal);
        });
        var close = pf.getNode(mathjs.add([0.1,0.1], goal.s), pf.vMax, pf.aMax);
    })
    it("tsdv(v1,v2,jerk) estimates velocity transition time", function() {
        var jerk = 1;
        var pf = new Pathfinder();

        // same direction
        pf.tsdv(0,10,1).t.should.equal(4);
        pf.tsdv(10,0,1).t.should.equal(4);
        pf.tsdv(-6,0,1).t.should.equal(3);
        pf.tsdv(0,-6,1).t.should.equal(3);
        pf.tsdv(0,3,1).t.should.equal(2);
        pf.tsdv(1,11,1).t.should.equal(4);
        pf.tsdv(-12,-2,1).t.should.equal(4);
        
        // change direction
        pf.tsdv(-5,5,1).t.should.approximately(5.4, 0.01);
        pf.tsdv(5,-5,1).t.should.approximately(5.4, 0.01);

        pf.tsdv(0,10,1).s.should.approximately(18.67,0.01);
        pf.tsdv(1,11,1).s.should.approximately(22.67,0.01);
        pf.tsdv(-11,-1,1).s.should.approximately(22.67,0.01);
        pf.tsdv(10,0,1).s.should.approximately(18.67,0.01);
        pf.tsdv(-5,5,1).s.should.approximately(13.87,0.01);
        pf.tsdv(5,-5,1).s.should.approximately(13.87,0.01);
    })
    it("TESTTESTpath(start, goal) returns pf to goal", function() {
        var verbose = true;
        var pf = new Pathfinder({
            dimensions: 1,
            maxVelocity: [20],
            maxAcceleration: [5],
            maxJerk: [1],
        });
        var start = new PathNode([0]);
        var goal = new PathNode([-30]);
        var maxIterations = 100;
        var iterations = 0;
        var msStart = new Date();
        var path = pf.findPath(start, goal, {
            onOpenSet: (openset) => {
                verbose && console.log("openset", openset.length, openset[0], 
                    "cost", mathjs.round(pf.estimateCost(openset[0], goal), 3)
                );
                if (openset.length === 30) {
                    openset.forEach((node,i) => 
                        console.log("openset["+i+"]", JSON.stringify(node), mathjs.round(pf.estimateCost(node, goal), 8))
                    );
//                      return false;
                }
                return ++iterations < maxIterations;
            },
        });
        var msElapsed = new Date() - msStart;
        path.forEach((n) => console.log(n,
            "cost", mathjs.round(pf.estimateCost(n, goal), 3)
        ));
        path.length === 0 && console.log("FAIL: no path");
        console.log("path", iterations, msElapsed+"ms", path.length+"nodes");
    })
})
