var mathjs = require("mathjs");
var AStarGraph = require("./AStarGraph");

(function(exports) { 
    
    class PathNode {
        constructor(position, velocity, acceleration) {
            this.s = position;
            this.v = velocity || Array(position.length).fill(0);
            this.a = acceleration || Array(position.length).fill(0);
            Object.defineProperty(this, "key", {
                value: JSON.stringify(this)
            });
        }
    }

    class Pathfinder extends AStarGraph {
        constructor(options={}) {
            super(options);
            this.dimensions = options.dimensions || 1;
            this.vMax = options.maxVelocity || Array(this.dimensions).fill(10);
            this.aMax = options.maxAcceleration || Array(this.dimensions).fill(2);
            this.jMin = options.minJerk || Array(this.dimensions).fill(0.1);
            this.jerkScale = 1; // fraction of path length
            this.jMax = this.aMax; // initial value
            this.a0 = Array(this.dimensions).fill(0);
            this.round = 2; // force discrete graph space
            this.nodeMap = {};
            this.neighbors = new WeakMap();
            this.stopTimes = {};
            this.stats = {
                lookupTotal: 0,
                lookupHit: 0,
                tsdv: 0,
                neighborsOf: 0,
            };
        }
        svaToNode(position, velocity, acceleration) {
            var node = new PathNode(position, velocity, acceleration);
            return this.lookupNode(node);
        }
        lookupNode(node) {
            var key = node.key; 
            var result = this.nodeMap[key];
            this.stats.lookupTotal++;
            if (result) {
                this.stats.lookupHit++;
            } else {
                result = this.nodeMap[key] = node;
            }
            return result;
        }
        axisAccelerations(node, i, dsgoal) {
            var av = [];
            var ai = node.a[i];
            var vi = node.v[i];
            var aMax = this.aMax[i];
            var aMin = -aMax;
            var jMax = this.jMax[i];
            var aplus = ai + jMax;
            var aminus = ai - jMax;
            var vplus = vi + aplus;
            var vminus = vi + aminus;
            var vMax = this.vMax[i];
            var vMin = -vMax;
            var ds = dsgoal < 0 ? -dsgoal : dsgoal;
            vMax = ds < vMax ? ds : vMax; // prevent overshoot
            vMin = vMin < -ds ? -ds : vMin; // prevent overshoot
            if (ai < aMax && vMin <= vplus && vplus <= vMax) {
                av.push(aMax < aplus ? aMax : aplus);
            }
            if (vMin <= ai+vi && vMin <= ai+vi && ai+vi <= vMax) {
                av.push(ai);
            }
            if (aMin < ai && vMin <= vminus && vminus <= vMax) {
                av.push(aMin > aminus ? aMin : aminus);
            }
            return av;
        }
        static validateNode(node) {
            if (!(node instanceof PathNode)) {
                throw new Error("Expected neigbhorsOf(?PathNode?,...)");
            }
            return node;
        }
        findPath(start, goal, options) { // Implements A* algorithm
            start = this.svaToNode(
                mathjs.round(start.s, this.round),
                mathjs.round(start.v, this.round),
                mathjs.round(start.a, this.round)
            );
            goal = this.svaToNode(
                mathjs.round(goal.s, this.round),
                mathjs.round(goal.v, this.round),
                mathjs.round(goal.a, this.round)
            );
            var ds = mathjs.abs(mathjs.subtract(goal.s, start.s));
            var jerk = mathjs.round(mathjs.divide(ds, this.jerkScale), this.round);
            this.jMax = jerk.map((j,i) => mathjs.min(this.aMax[i], mathjs.max(j, this.jMin[i])));
            this.neighbors = new WeakMap();
            return super.findPath(start, goal, options);
        }
        isGoalNeighbor(node, goal) { // a goal is zero-velocity
            var verbose = false;

            for (var i = 0; i < this.dimensions; i++) {
                var jMax = this.jMax[i];
                var ds = goal.s[i] - node.s[i];

                if (ds < -jMax || jMax < ds) {
                    verbose && console.log("too far", ds,  JSON.stringify(node));
                    return false; // too far
                }

                var vi = node.v[i];
                if (vi < -jMax || jMax < vi) {
                    verbose && console.log("too fast", JSON.stringify(node));
                    return false; // too fast
                }
                if (vi < 0 && ds > 0 || vi > 0 && ds < 0) {
                    verbose && console.log("wrong way velocity", JSON.stringify(node));
                    return false; // wrong way velocity
                }

                var ai = node.a[i];
                if (ai < -jMax || jMax < ai) {
                    verbose && console.log("too jerky", JSON.stringify(node));
                    return false; // too jerky
                }

                var dv = 0 - vi;
                if (dv > 0 && ai < -jMax || dv < 0 && ai > jMax) { // allow 2 * jerk acceleration when stopping
                    verbose && console.log("wrong way acceleration", JSON.stringify(node));
                    return false; // wrong way acceleration
                }
            }
            return true;
        }
        neighborsOf(node, goal) {
            this.stats.neighborsOf++;
            if (goal && this.isGoalNeighbor(node, goal)) {
                return [goal];
            }
            var anewbasis = node.a.map((a,i) => this.axisAccelerations(node, i, goal.s[i]-node.s[i]));
            var apermutations = Pathfinder.permutations(anewbasis).map((anew) => {
                var avariation = anew;
                // Minimize number of states by applying acceleration variations immediately 
                // to velocity and position.
                var vvariation = mathjs.add(node.v,avariation);
                var svariation = mathjs.add(node.s,vvariation);

                return this.svaToNode(svariation, vvariation, avariation);
            });
            return apermutations;
        }
        cost(n1, n2, goal) {
            return n1 === n2 ? 0 : 1;
        }
        tsdv(v1, v2, jerk) { // time and distance for change in velocity
            if (v1 === v2) {
            this.stats.tsdv++;
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
            this.stats.tsdv++;
            var dv = v2 - v1;
            var t = -0.5 + mathjs.sqrt(0.25 + 2 * dv / jerk); // dv = jerk * t * (t + 1) / 2
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

                //if (dsi === 0 && v2 !== v1) {
                    //n1.culled = "velocity change without moving";
                    //return Number.MAX_SAFE_INTEGER; // can't changing velocity without moving
                //}
                var dsiabs = mathjs.abs(dsi);
                if (dsiabs > this.jMax[i] && mathjs.abs(n1.v[i]) > dsiabs) {
                    n1.culled = "too fast";
                    return Number.MAX_SAFE_INTEGER; // too fast
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
            var result = mathjs.max(t);
            return result;
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
    it("svaToNode(s,v,a) returns unique node with given attributes", function() {
        var pf = new Pathfinder({
            dimensions: 2,
        });
        var n1 = pf.svaToNode([1,2],[3,4],[5,6]);
        var n2 = pf.svaToNode([1,2],[3,4],[5,6]);
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
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[0,0],[0,1]), 0), [1,0,-1]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[0,0],[1,1]), 0), [2,1,0]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[0,0],[4,1]), 0), [4,3]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[0,0],[-4,1]), 0), [-3,-4]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[10,0],[0,0]), 0), [0,-1]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[-10,0],[0,0]), 0), [1,0]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[10,0],[1,0]), 0), [0]);
        should.deepEqual(pf.axisAccelerations(pf.svaToNode([0,0],[-10,0],[-2,0]), 0), []);
    })
    it("TESTTESTpermutations(vv) generates permutations", function() {
        should.deepEqual(Pathfinder.permutations([[1,2],[3,4,5]]), [
            [1,3],
            [2,3],
            [1,4],
            [2,4],
            [1,5],
            [2,5],
        ]);
        should.deepEqual(Pathfinder.permutations([[1,2],[],[3,4,5]]), []);
        var msStart = new Date();
        for (var i = 0; i<1000; i++) {
            Pathfinder.permutations([[1,2],[3,4,5]]);
        }
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(60); // ~0.04ms
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
        neighbors[0].should.equal(pf.svaToNode([2,2],[1,1],[1,1]));
        neighbors[1].should.equal(pf.svaToNode([1,2],[0,1],[0,1]));
        neighbors[2].should.equal(pf.svaToNode([0,2],[-1,1],[-1,1]));
        neighbors[8].should.equal(pf.svaToNode([0,0],[-1,-1],[-1,-1]));

        var node = new PathNode([1,1],[1,1],[1,1]);
        var neighbors = pf.neighborsOf(node);
        neighbors[0].should.equal(pf.svaToNode([4,4],[3,3],[2,2]));
        neighbors[1].should.equal(pf.svaToNode([3,4],[2,3],[1,2]));
        neighbors[2].should.equal(pf.svaToNode([2,4],[1,3],[0,2]));
        neighbors[3].should.equal(pf.svaToNode([4,3],[3,2],[2,1]));
        neighbors[4].should.equal(pf.svaToNode([3,3],[2,2],[1,1]));
        neighbors[5].should.equal(pf.svaToNode([2,3],[1,2],[0,1]));
        neighbors[6].should.equal(pf.svaToNode([4,2],[3,1],[2,0]));
        neighbors[7].should.equal(pf.svaToNode([3,2],[2,1],[1,0]));
        neighbors[8].should.equal(pf.svaToNode([2,2],[1,1],[0,0]));
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

        pf.isGoalNeighbor(pf.svaToNode([0,0]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.svaToNode([2,0]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.svaToNode([2,2]), goal).should.equal(true);
        pf.isGoalNeighbor(pf.svaToNode([0,2]), goal).should.equal(true);

        pf.isGoalNeighbor(pf.svaToNode([0,0],[1,1]), goal).should.equal(true); // can stop
        pf.isGoalNeighbor(pf.svaToNode([2,2],[-1,-1]), goal).should.equal(true); // can stop
        pf.isGoalNeighbor(pf.svaToNode([0,0],[1.1,1.1]), goal).should.equal(false); // too fast
        pf.isGoalNeighbor(pf.svaToNode([0,0],[-1.1,-1.1]), goal).should.equal(false); // too fast
        pf.isGoalNeighbor(pf.svaToNode([0,0],[1,1],[-1,-1]), goal).should.equal(true); // can decelerate
        pf.isGoalNeighbor(pf.svaToNode([2,2],[-1,-1],[1,1]), goal).should.equal(true); // can decelerate
        pf.isGoalNeighbor(pf.svaToNode([0,0],[1,1],[-1.1,-1.1]), goal).should.equal(false); // too jerky
        pf.isGoalNeighbor(pf.svaToNode([2,2],[1,1],[1.1,1.1]), goal).should.equal(false); // too jerky
        pf.isGoalNeighbor(pf.svaToNode([0,0],[-1,-1]), goal).should.equal(false); // wrong velocity direction
        pf.isGoalNeighbor(pf.svaToNode([2,2],[1,1]), goal).should.equal(false); // wrong velocity direction
        pf.isGoalNeighbor(pf.svaToNode([0,0],[1,1],[2,2]), goal).should.equal(false); // wrong acceleration direction
        pf.isGoalNeighbor(pf.svaToNode([2,2],[-1,-1],[-2,-2]), goal).should.equal(false); // wrong acceleration direction

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
    it("TESTTESTneighborsOf(node, goal) generates goal node if near", function() {
        var pf = new Pathfinder({
            dimensions: 2,
        });
        var goal = new PathNode([1,1]);
        var neighbors = pf.neighborsOf(goal, goal);
        neighbors.forEach((n) => {
            var vinverse = mathjs.multiply(-1, n.v);
            var ninverse = pf.svaToNode(n.s, vinverse); 
            var nn = pf.neighborsOf(ninverse, goal);
            nn.length.should.equal(1, JSON.stringify(n));
            nn[0].should.equal(goal);
        });
        var close = pf.svaToNode(mathjs.add([0.1,0.1], goal.s), pf.vMax, pf.aMax);
        msStart = new Date();

        for (var i=0; i<100; i++) {
            var neighbors = pf.neighborsOf(goal, goal);
        }
        msElapsed = new Date() - msStart;
        msElapsed.should.below(40); // neighborsOf is a CPU hog @ >0.1ms
    })
    it("TESTTESTtsdv(v1,v2,jerk) estimates velocity transition time", function() {
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

        var msStart = new Date();
        for (var i=0; i<10000; i++) {
            pf.tsdv(5,-5,1);
        }
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(10);
    })
    it("TESTTESTfindPath(start, goal) finds 1D acceleration path", function() {
        this.timeout(60*1000);
        var verbose = 0;
        function test1(maxIterations, startPos, goalPos) {
            var pf = new Pathfinder({
                dimensions: 1,
                maxVelocity: [20],
                maxAcceleration: [5],
            });
            var start = new PathNode([startPos]);
            var goal = new PathNode([goalPos]);
            var iterations = 0;
            var msStart = new Date();
            var path = pf.findPath(start, goal, {
                onOpenSet: (openset) => {
                    if (verbose>2) {
                        var current = pf.candidate(openset);
                        var path = pf.pathTo(current);
                        console.log("openset:"+openset.length, 
                            "path:"+JSON.stringify(mathjs.round(path.map((node) => node.s[0]),2)),
                            JSON.stringify(current),
                            "g:"+path.length,
                            "h:"+mathjs.round(pf.estimateCost(current, goal), pf.round)
                        );
                    }
                    if (verbose>2 && openset.length === 20) {
                        var sorted = openset.map((node)=>node).sort((a,b) => pf.fscore(a) - pf.fscore(b));
                        sorted.forEach((node,i) => {
                            console.log("openset["+i+"]", JSON.stringify(node), "g:"+pf.gscore(node), "f:"+pf.fscore(node));
                        })
                    }
                    return ++iterations < maxIterations;
                },
                onCull: (node, gscore_new, gscore_existing) => {
                    if (verbose>2) {
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
            verbose>1 && path.forEach((n) => console.log(n,
                "cost", mathjs.round(pf.estimateCost(n, goal), pf.round)
            ));
            verbose>0 && console.log(
                JSON.stringify([start.s[0],goal.s[0]]),
                (verbose>1 ? "path:"+JSON.stringify(mathjs.round(path.map((node) => node.s[0]),1)):""),
                "iter:"+iterations, 
                msElapsed+"ms", 
                "path:"+path.length,
                (verbose>1 ? "jerk:"+JSON.stringify(pf.jMax):""), 
                "lookup:"+pf.stats.lookupHit+"/"+pf.stats.lookupTotal,
                "neighborsOf:"+pf.stats.neighborsOf,
                "");
            path.length.should.above(0);
            path.length === 0 && console.log("FAIL: no path");
            return msElapsed;
        }
        var msElapsedTotal = 0;
        var nTests = 20;
        nTests === 1 && (verbose = 2);
        for (var i = 0; i < nTests; i++) {
            var bounds = 300;
            var maxIterations = 400;
            var startPos = mathjs.random(-bounds,bounds);
            var goalPos = mathjs.random(-bounds,bounds);
            msElapsedTotal += test1(maxIterations, startPos, goalPos);
        }
        (msElapsedTotal/nTests).should.below(20);
        nTests>1 && console.log("findPath ms avg:", msElapsedTotal/nTests);
    })
})
