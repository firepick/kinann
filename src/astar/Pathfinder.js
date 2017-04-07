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
            this.round = 3; // force discrete graph space
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
                var verbose = false;

                if (ds < -jMax || jMax < ds) {
                    verbose && console.log("too far", ds,  JSON.stringify(node));
                    return false; // too far
                }
                if (v < -jMax || jMax < v) {
                    verbose && console.log("too fast", JSON.stringify(node));
                    return false; // too fast
                }
                if (a < -jMax || jMax < a) {
                    verbose && console.log("too jerky", JSON.stringify(node));
                    return false; // too jerky
                }
                if (v < 0 && ds > 0 || v > 0 && ds < 0) {
                    verbose && console.log("wrong way velocity", JSON.stringify(node));
                    return false; // wrong way velocity
                }
                if (dv > 0 && a < -jMax || dv < 0 && a > jMax) { // allow 2 * jerk acceleration when stopping
                    verbose && console.log("wrong way acceleration", JSON.stringify(node));
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
                var avariation = mathjs.round(anew, this.round);
                var vvariation = mathjs.round(mathjs.add(node.v,avariation), this.round);
                var svariation = mathjs.round(mathjs.add(node.s,vvariation), this.round);
                return this.getNode(svariation, vvariation, avariation, node);
            });
            return apermutations;
        }
        cost(n1, n2, goal) {
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
            //var s = t * (v1 + jerk * t * ( t / 6 + 0.5*jerk));
            var s = t * (jerk * t * ( t / 6 + 0.5*jerk));
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
                    return Number.MAX_SAFE_INTEGER; // no stopping
                }
                var scruise = dsiabs - ts.s;
                if (v1 < 0 && dsi > 0 || v1 > 0 && dsi < 0) {
                    scruise += mathjs.abs(v1); // backtrack penalty (not exact)
                }
                if (scruise <= 0) {
                    return ts.t;
                }
                if (v1 == 0) {
                    if (v2 === 0) {
                        return 1; // admissible but not accurate
                    } else {
                        return scruise / v2;
                    }
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
        pf.estimateCost(n1,n2).should.equal(1);
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
        var verbose = true;
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
        pf.isGoalNeighbor(pf.getNode([0,0],[1,1],[2,2]), goal).should.equal(false); // wrong acceleration direction
        pf.isGoalNeighbor(pf.getNode([2,2],[-1,-1],[-2,-2]), goal).should.equal(false); // wrong acceleration direction

        var pf = new Pathfinder({
            dimensions: 1,
            maxVelocity: [100],
            maxAcceleration: [2],
            maxJerk: [1],
        });
        var goal = new PathNode([-7.5]);
        var start = new PathNode([-8.6]);
        pf.isGoalNeighbor(start, goal).should.equal(false); 
        var neighbors = pf.neighborsOf(start, goal);
        neighbors.reduce((acc, neighbor) => {
            var isNear = pf.isGoalNeighbor(neighbor, goal);
            verbose && console.log("neighbor", JSON.stringify(neighbor), isNear);
            return acc || isNear;
        }, false).should.equal(true); // at least one neighbor must be near goal
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
        pf.tsdv(1,11,1).s.should.approximately(18.67,0.01);
        pf.tsdv(-11,-1,1).s.should.approximately(18.67,0.01);
        pf.tsdv(10,0,1).s.should.approximately(18.67,0.01);
        pf.tsdv(-5,5,1).s.should.approximately(13.87,0.01);
        pf.tsdv(5,-5,1).s.should.approximately(13.87,0.01);
    })
    it("TESTTESTpath(start, goal) returns pf to goal", function() {
        this.timeout(60*1000);
        var verbose = false;
        function test1(bounds, maxIterations) {
            var pf = new Pathfinder({
                dimensions: 1,
                maxVelocity: [20],
                maxAcceleration: [5],
                maxJerk: [1],
            });
            var start = new PathNode([mathjs.round(mathjs.random(-bounds,bounds),3)]);
            var goal = new PathNode([mathjs.round(mathjs.random(-bounds,bounds),3)]);
            //var start = new PathNode([6.7]);
            //var goal = new PathNode([-11.6]);
            var iterations = 0;
            var msStart = new Date();
            var path = pf.findPath(start, goal, {
                onOpenSet: (openset) => {
                    if (verbose) {
                        var current = pf.candidate(openset);
                        var path = pf.pathTo(current);
                        console.log("openset", openset.length, current,
                            JSON.stringify(mathjs.round(path.map((node) => node.s[0]),1)),
                            "g:"+path.length,
                            "h:"+mathjs.round(pf.estimateCost(current, goal), 3)
                        );
                    }
                    //if (verbose && openset.length === 20) {
                        //var sorted = openset.map((node)=>node).sort((a,b) => pf.fscore(a) - pf.fscore(b));
                        //sorted.forEach((node,i) => {
                            //console.log("openset["+i+"]", JSON.stringify(node), "g:"+pf.gscore(node), "f:"+pf.fscore(node));
                        //})
                    //}
                    return ++iterations < maxIterations;
                },
                onCull: (node, gscore_new, gscore_existing) => {
                    if (verbose) {
                        console.log("culling", JSON.stringify(node), gscore_new, gscore_existing);
                    }
                    return null;
                },
            });
            var msElapsed = new Date() - msStart;
            path.reduce((acc,n) => { // velocity should not switch directions
                acc < 0 && n.v[0].should.not.above(0);
                acc > 0 && n.v[0].should.not.below(0);
                acc = n.v[0];
            }, 0);
            verbose &&path.forEach((n) => console.log(n,
                "cost", mathjs.round(pf.estimateCost(n, goal), 3)
            ));
            console.log("path", JSON.stringify(start), "=>", JSON.stringify(goal), iterations, msElapsed+"ms", path.length+"nodes");
            path.length.should.above(0);
            msElapsed.should.below(500);
            path.length === 0 && console.log("FAIL: no path");
        }
        for (var i = 0; i < 100; i++) {
            test1(100, 1000);
        }
    })
})
