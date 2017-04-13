var mathjs = require("mathjs");
var AStarGraph = require("./AStarGraph");
var PathNode = require("./PathNode");

(function(exports) { 
    
    class PathFactory extends AStarGraph {
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
            this.nodeId = 0;
            this.stats = {
                lookupTotal: 0,
                lookupHit: 0,
                tsdv: 0,
                tsdva: 0,
                neighborsOf: 0,
            };
        }
        isCruiseNode(node) {
            return node.v.reduce((acc,v,i) => acc || v === this.vMax[i] || v === -this.vMax[i], false);
        }
        svaToNode(position, velocity, acceleration) {
            var node = new PathNode(position, velocity, acceleration);
            return this.lookupNode(node);
        }
        toJSON() {
            var obj = super.toJSON();
            console.log("ha");
            obj.f && (obj.f = ((obj.f*100+0.5)|0)/100);
            return obj;
        }
        iAxisAccelerations(node, i, dsgoal) {
            var pf = this;
            function * iAxisAccelerations(node, i, dsgoal) {
                var av = [];
                var ai = node.a[i];
                var vi = node.v[i];
                var aMax = pf.aMax[i];
                var aMin = -aMax;
                var jMax = pf.jMax[i];
                var aplus = ai + jMax;
                var aminus = ai - jMax;
                var vplus = vi + aplus;
                var vminus = vi + aminus;
                var vzero = vi + ai;
                var vMax = pf.vMax[i];
                var vMin = -vMax;
                if (dsgoal >= 0) {
                    var ds = dsgoal;
                    vMax = ds < vMax ? ds : vMax; // prevent overshoot
                    if (0<vzero && ds < vzero) {
                        // cull overshoot
                    } else if (vMin <= vzero && vMin <= vzero && vzero <= vMax) {
                        yield(ai); // maintain acceleration
                    }
                    if (0<vplus && ds < vplus) {
                        // cull overshoot
                    } else if (ai < aMax && vMin <= vplus && vplus <= vMax) {
                        yield(aMax < aplus ? aMax : aplus);
                    }
                    if (0<vminus && ds < vminus) {
                        // cull overshoot
                    } else if (aMin < ai && vMin <= vminus && vminus <= vMax) {
                        yield(aMin > aminus ? aMin : aminus);
                    }
                } else {
                    vMin = vMin < dsgoal ? dsgoal : vMin; // prevent overshoot
                    if (vzero<0 && dsgoal > vzero) { 
                        // cull overshoot
                    } else if (vMin <= vzero && vMin <= vzero && vzero <= vMax && (vzero || vi)) {
                        yield(ai); // maintain acceleration
                    }
                    if (vminus<0 && dsgoal > vminus) {
                        // cull overshoot
                    } else if (aMin < ai && vMin <= vminus && vminus <= vMax) {
                        yield(aMin > aminus ? aMin : aminus);
                    }
                    if (true && vplus<0 && dsgoal > vplus) {
                        // cull overshoot
                    } else if (ai < aMax && vMin <= vplus && vplus <= vMax) {
                        yield(aMax < aplus ? aMax : aplus);
                    }
                }
            }
            return iAxisAccelerations(node, i, dsgoal);
        }
        lookupNode(node) {
            var key = node.key; 
            var result = this.nodeMap[key];
            this.stats.lookupTotal++;
            if (result) {
                this.stats.lookupHit++;
            } else {
                result = this.nodeMap[key] = node;
                node.id = ++this.nodeId;
            }
            return result;
        }
        axisAccelerations(node, i, dsgoal) {
            return Array.from(this.iAxisAccelerations(node, i, dsgoal));
        }
        static validateNode(node) {
            if (!(node instanceof PathNode)) {
                throw new Error("Expected neigbhorsOf(?PathNode?,...)");
            }
            return node;
        }
        findPath(start, goal, options) { 
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
            var result = super.findPath(start, goal, options);
            result.stats.start = start.s;
            result.stats.goal = goal.s;

            return result;
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
            if (true) {
                function * iNeighbors(pf, anewbasis) {
                    for (var anew of PathFactory.permutations(anewbasis)) {
                        var avariation = anew;
                        var vvariation = mathjs.add(node.v,avariation); // instantaneous acceleration
                        var svariation = mathjs.add(node.s,vvariation); // instantaneous acceleration
                        var neighbor = pf.svaToNode(svariation, vvariation, avariation);
                        if (pf.estimateCost(neighbor, goal) < Number.MAX_SAFE_INTEGER) {
                            yield(neighbor);
                        }
                    }
                }
                return iNeighbors(this, anewbasis);
            }
            // SLIGHTLY SLOWER...
            //var neighbors = Array.from(iNeighbors(this, anewbasis)).sort((a,b) => a.h - b.h);
            //return neighbors;
            var hMin = Number.MAX_SAFE_INTEGER;
            var hIndex = -1;
            var neighbors = PathFactory.permutations(anewbasis).reduce((acc,anew) => {
                var avariation = anew;
                // Minimize number of states by applying acceleration variations immediately 
                // to velocity and position.
                var vvariation = mathjs.add(node.v,avariation);
                var svariation = mathjs.add(node.s,vvariation);
                var neighbor = this.svaToNode(svariation, vvariation, avariation);
                if (this.estimateCost(neighbor, goal) < Number.MAX_SAFE_INTEGER) {
                    if (neighbor.h < hMin) {
                        hIndex = acc.length;
                        hMin = neighbor.h;
                    }
                    acc.push(neighbor);
                }
                return acc;
            }, []);
            //return neighbors.sort((a,b) => a.h - b.h); // SLIGHTLY SLOWER
            if (hIndex > 0) { // SLIGHTLY FASTER
                var tmp = neighbors[hIndex];
                neighbors[hIndex] = neighbors[0];
                neighbors[0] = tmp;
            }
            return neighbors;
        }
        cost(n1, n2) {
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
                        s: r1.s + r2.s,
                    }
                }
            }
            if (v2 < 0) {
                var r1 = this.tsdv(0, v1, jerk);
                var r2 = this.tsdv(0, -v2, jerk);
                return {
                    t: r1.t + r2.t,
                    s: r1.s + r2.s,
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
        tsdva(v1, v2, a) { // time and distance for change in velocity
            if (v1 === v2) {
            this.stats.tsdva++;
                return {
                    t: 0,
                    s: 0,
                }
            }
            if (v1 < 0) {
                if (v2 < 0) {
                    return this.tsdva(-v1, -v2, a);
                } else {
                    var r1 = this.tsdva(0, -v1, a);
                    var r2 = this.tsdva(-v1, v2, a);
                    return {
                        t: 2*r1.t + r2.t,
                        s: 2*r1.s + r2.s,
                    }
                }
            }
            if (v2 < 0) {
                var r1 = this.tsdva(0, v1, a);
                var r2 = this.tsdva(0, -v2, a);
                return {
                    t: r1.t + r2.t,
                    s: r2.s + r2.s,
                }
            }
            if (v2 < v1) {
                return this.tsdva(v2, v1, a);
            }
            this.stats.tsdv++;
            var dv = v2 - v1;
            var t = -0.5 + mathjs.sqrt(0.25 + 2 * dv / a); // dv = a * t * (t + 1) / 2
            var s = t * (a * t * ( t / 6 + 0.5*a));
            return {
                t: t,
                s: s,
            }
        }
        estimateCost(n1, goal) {
            if (n1.h) {
                return n1.h;
            }
            var ds = mathjs.subtract(goal.s, n1.s);
            var vts = n1.v.map((v1, i) => this.tsdv(v1, goal.v[i], this.jMax[i]));
            var t = vts.map((ts,i) => { // transition time + cruise time
                var v1 = n1.v[i];
                var v2 = goal.v[i];
                var dvi = v2 - v1;
                var dsi = ds[i];

                //if (dsi === 0 && v2 !== v1) {
                    //n1.culled = "velocity change without moving";
                    //return n1.h = Number.MAX_SAFE_INTEGER; // can't changing velocity without moving
                //}
                var dsiabs = mathjs.abs(dsi);
                if (dsiabs > this.jMax[i] && mathjs.abs(n1.v[i]) > dsiabs) {
                    n1.culled = "too fast";
                    return n1.h = Number.MAX_SAFE_INTEGER; // too fast
                }
                var scruise = dsiabs - ts.s;
                if (v1 < 0 && dsi > 0 || v1 > 0 && dsi < 0) {
                    scruise += mathjs.abs(v1); // backtrack penalty (not exact)
                }
                if (scruise <= 0) {
                    return n1.h = ts.t;
                }
                if (v1 == 0) {
                    if (v2 === 0) {
                        return n1.h = 1; // admissible but not accurate
                    } else {
                        return n1.h = scruise / v2;
                    }
                }
                return n1.h = ts.t + scruise / mathjs.abs(v1);
            });
            return n1.h = mathjs.sum(t);
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

    module.exports = exports.PathFactory = PathFactory;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PathFactory", function() {
    var should = require("should");
    var PathFactory = exports.PathFactory;

    function testFindPath(pf, start, goal, verbose) {
        var result = pf.findPath(start, goal, {
            onNeighbor: (neighbor,outcome) => {
                if (verbose>3) {
                    var path = pf.pathTo(neighbor);
                    console.log(
                        outcome,
                        "nbr:"+path.map((node) => node.id),
                        "=",
                        JSON.stringify(neighbor),
                        "h:"+mathjs.round(pf.estimateCost(neighbor, goal), pf.round)
                    );
                }
            },
            onCurrent: (current) => {
                if (verbose>2) {
                    var path = pf.pathTo(current);
                    console.log(
                        "cur:"+path.map((node) => node.id),
                        "=",
                        JSON.stringify(current),
                        "h:"+mathjs.round(pf.estimateCost(current, goal), pf.round)
                    );
                }
                return true;
            },
            onCull: (node, gscore_new) => {
                if (verbose>3) {
                    console.log("culling", JSON.stringify(node), gscore_new);
                }
                return null;
            },
        });
        var path = result.path;
        path.reduce((acc,n) => { // velocity should not switch directions
            acc < 0 && n.v[0].should.not.above(0);
            acc > 0 && n.v[0].should.not.below(0);
            acc = n.v[0];
        }, 0);
        verbose>1 && path.forEach((n,i) => console.log("path["+i+"]", JSON.stringify(n), pf.isCruiseNode(n) ? "cruise" : "accel"));
        verbose>0 && console.log("findPath", JSON.stringify(result.stats));
        path.length.should.above(0);
        path.length === 0 && console.log("FAIL: no path");
        return result.stats.ms;
    }

    it("PathNode(name, pos, velocity) is the constructor", function() {
        var n1 = new PathNode([1,1,1]);
        should.deepEqual(n1.v, [0,0,0]); // default velocity is zero
        var n2 = new PathNode([1,1,1], [1,2,3]);
        should.deepEqual(n2.v, [1,2,3]);
    });
    it("TESTTESTestimateCost(n1,n2) estimates the cost to move between the given nodes", function() {
        var vmax = 10;

        var jmax = 5;
        var pf = new PathFactory({
            dimensions: 3,
            maxVelocity: [vmax,vmax,vmax],
            maxAcceleration: [jmax,jmax,jmax],
        });
        var goal = new PathNode([0.1,50.1,-50.1]);
        pf.estimateCost(pf.svaToNode([0,0,-5],[0,0,-5],[0,0,-5]),goal).should.approximately(9.35, 0.1);
        pf.estimateCost(pf.svaToNode([0,5,-5],[0,5,-5],[0,5,-5]),goal).should.approximately(15.7, 0.1);

        var jmax = 1;
        var pf = new PathFactory({
            dimensions: 1,
            maxVelocity: [vmax],
            maxAcceleration: [jmax],
        });
        var goal = new PathNode([-10.1]);
        var node = new PathNode([-10],[-1]);
        pf.estimateCost(node,goal).should.approximately(1, 0.1);

        var pf = new PathFactory({
            dimensions: 3,
            maxVelocity: [vmax, vmax, vmax],
            maxAcceleration: [jmax,jmax,jmax],
        });
        var n1 = new PathNode([1,3,2]);
        var n2 = new PathNode([3,1,4]);
        pf.estimateCost(n1,n2).should.equal(3);
    })
    it("svaToNode(s,v,a) returns unique node with given attributes", function() {
        var pf = new PathFactory({
            dimensions: 2,
        });
        var n1 = pf.svaToNode([1,2],[3,4],[5,6]);
        var n2 = pf.svaToNode([1,2],[3,4],[5,6]);
        n1.should.equal(n2);
        n1.should.instanceOf(PathNode);
    })
    it("permutations(vv) generates permutations", function() {
        should.deepEqual(PathFactory.permutations([[1,2],[3,4,5]]), [
            [1,3],
            [2,3],
            [1,4],
            [2,4],
            [1,5],
            [2,5],
        ]);
        should.deepEqual(PathFactory.permutations([[1,2],[],[3,4,5]]), []);
        var msStart = new Date();
        for (var i = 0; i<1000; i++) {
            PathFactory.permutations([[1,2],[3,4,5]]);
        }
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(60); // ~0.04ms
    })
    it("neighborsOf(node) iterates over node neighbors", function() {
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [10,10],
            maxAcceleration: [1,1],
        });

        var goal = new PathNode([-10.1,-10.1]);
        var node = new PathNode([-10,-10],[-1,-1]);
        var neighbors = Array.from(pf.neighborsOf(node, goal));
        neighbors.length.should.equal(1);

        var start = new PathNode([1,1]);
        var neighbors = Array.from(pf.neighborsOf(start, goal));
        neighbors.length.should.equal(4);
        neighbors[0].should.equal(pf.svaToNode([0,0],[-1,-1],[-1,-1])); // closest to goal
        neighbors[1].should.equal(pf.svaToNode([2,0],[1,-1],[1,-1]));
        neighbors[2].should.equal(pf.svaToNode([0,2],[-1,1],[-1,1]));
        neighbors[3].should.equal(pf.svaToNode([2,2],[1,1],[1,1]));

        var node = new PathNode([1,1],[1,1],[1,1]);
        var neighbors = Array.from(pf.neighborsOf(node, goal));
        neighbors.length.should.equal(4);
        neighbors[0].should.equal(pf.svaToNode([3,3],[2,2],[1,1]));
        neighbors[1].should.equal(pf.svaToNode([2,3],[1,2],[0,1]));
        neighbors[2].should.equal(pf.svaToNode([3,2],[2,1],[1,0]));
        neighbors[3].should.equal(pf.svaToNode([2,2],[1,1],[0,0])); 
    })
    it("isGoalNeighbor(node, goal) returns true if goal is reachable in one step from node", function() {
        var verbose = false;
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [100,100],
            maxAcceleration: [1,1],
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

        var pf = new PathFactory({
            dimensions: 1,
            maxVelocity: [100],
            maxAcceleration: [1],
            maxJerk: [1],
        });
        var goal = new PathNode([-7.5]);
        var start = new PathNode([-8.6]);
        pf.isGoalNeighbor(start, goal).should.equal(false); 
        var neighbors = Array.from(pf.neighborsOf(start, goal));
        neighbors.reduce((acc, neighbor) => {
            var isNear = pf.isGoalNeighbor(neighbor, goal);
            verbose && console.log("neighbor", JSON.stringify(neighbor), isNear);
            return acc || isNear;
        }, false).should.equal(true); // at least one neighbor must be near goal
    })
    it("neighborsOf(node, goal) generates goal node if near", function() {
        var pf = new PathFactory({
            dimensions: 2,
        });
        var goal = new PathNode([1,1]);
        var neighbors = Array.from(pf.neighborsOf(goal, goal));
        neighbors.forEach((n) => {
            var vinverse = mathjs.multiply(-1, n.v);
            var ninverse = pf.svaToNode(n.s, vinverse); 
            var nn = Array.from(pf.neighborsOf(ninverse, goal));
            nn.length.should.equal(1, JSON.stringify(n));
            nn[0].should.equal(goal);
        });
        var close = pf.svaToNode(mathjs.add([0.1,0.1], goal.s), pf.vMax, pf.aMax);
        msStart = new Date();

        for (var i=0; i<100; i++) {
            var neighbors = Array.from(pf.neighborsOf(goal, goal));
        }
        msElapsed = new Date() - msStart;
        msElapsed.should.below(40); // neighborsOf is a CPU hog @ >0.1ms
    })
    it("tsdv(v1,v2,jerk) estimates velocity transition time", function() {
        var jerk = 1;
        var pf = new PathFactory();

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
        msElapsed.should.below(20);
    })
    it("iAxisAccelerations(node,i,dsgoal) generates axis acceleration iterator", function() {
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [10, 10],
            maxAcceleration: [1, 1],
        });
        function test_iAxisAcceleration(s,v,a, i, dsgoal, expected) {
            should.deepEqual(Array.from(pf.iAxisAccelerations(pf.svaToNode(s,v,a), i, dsgoal)), expected);
        }
        var dsgoal = 100; // forward to goal
        test_iAxisAcceleration([0,0],[0,0],[0,1], 0, dsgoal, [0,1,-1]); 
        test_iAxisAcceleration([0,0],[0,0],[0,1], 1, dsgoal, [1,0]); // cull 2:amax
        test_iAxisAcceleration([0,0],[0,0],[0,-1], 1, dsgoal, [-1,0]); // cull 2:-amax
        test_iAxisAcceleration([0,0],[10,0],[0,0], 0, dsgoal, [0,-1]); // cull 1:vmax
        test_iAxisAcceleration([0,0],[0,-10],[0,0], 1, dsgoal, [0,1]); // cull -1:vmax
        test_iAxisAcceleration([0,0],[10,0],[1,0], 0, dsgoal, [0]); // cull 2:vmax 1:vmax
        test_iAxisAcceleration([0,0],[-10,0],[-1,0], 0, dsgoal, [0]); // cull -2:vmax -1:vmax

        var dsgoal = -100; // backward to goal
        test_iAxisAcceleration([0,0],[0,0],[0,1], 0, dsgoal, [-1,1]); // cull 0:stationary
        test_iAxisAcceleration([0,0],[0,0],[0,1], 1, dsgoal, [1,0]); // cull 2:amax
        test_iAxisAcceleration([0,0],[0,0],[0,-1], 1, dsgoal, [-1,0]); // cull 2:-amax
        test_iAxisAcceleration([0,0],[10,0],[0,0], 0, dsgoal, [0,-1]); // cull 1:vmax
        test_iAxisAcceleration([0,0],[0,-10],[0,0], 1, dsgoal, [0,1]); // cull -1:vmax
        test_iAxisAcceleration([0,0],[10,0],[1,0], 0, dsgoal, [0]); // cull 2:vmax 1:vmax
        test_iAxisAcceleration([0,0],[-10,0],[-1,0], 0, dsgoal, [0]); // cull -2:vmax -1:vmax

        var dsgoal = 1; // near goal
        test_iAxisAcceleration([0,0],[0,0],[0,1], 0, dsgoal, [0,1,-1]); 
        test_iAxisAcceleration([0,0],[0,0],[0,1], 1, dsgoal, [1,0]); // cull 2:amax
        test_iAxisAcceleration([0,0],[0,0],[0,-1], 1, dsgoal, [-1,0]); // cull 2:-amax
        test_iAxisAcceleration([0,0],[10,0],[0,0], 0, dsgoal, []); // overshoot
        test_iAxisAcceleration([0,0],[0,-10],[0,0], 1, dsgoal, [0,1]); // cull -1:vmax
        test_iAxisAcceleration([0,0],[10,0],[1,0], 0, dsgoal, []); // overshoot
        test_iAxisAcceleration([0,0],[-10,0],[-1,0], 0, dsgoal, [0]); // cull -2:vmax -1:vmax
    })
    it("axisAccelerations(node, i) returns possible neighbor accelerations", function() {
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [100, 50],
            maxAcceleration: [5, 2],
        });
        function testAxisAccelerations(s,v,a,i,dsgoal,expected) {
            should.deepEqual(pf.axisAccelerations(pf.svaToNode(s,v,a),i,dsgoal), expected); 
        }
        var dsgoal = 100;
        testAxisAccelerations([0,0],[0,0],[0,1], 0, dsgoal, [0, 5,-5]);
    })
    it("findPath(start, goal) finds 1D acceleration path", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var msElapsedTotal = 0;
        var nTests = 20;
        nTests === 1 && (verbose = 2);
        for (var i = 0; i < nTests; i++) {
            var bounds = 300;
            var startPos = mathjs.random(-bounds,bounds);
            var goalPos = mathjs.random(-bounds,bounds);
            var start = new PathNode([startPos]);
            var goal = new PathNode([goalPos]);
            var pf = new PathFactory({
                dimensions: 1,
                maxVelocity: [20],
                maxAcceleration: [5],
                maxIterations: 400,
            });
            msElapsedTotal += testFindPath(pf, start, goal, verbose);
        }
        nTests>1 && (msElapsedTotal/nTests).should.below(20);
        nTests>1 && console.log("findPath ms avg:", msElapsedTotal/nTests);
    })
    it("TESTTESTfindPath(start, goal) finds 3D acceleration path", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var msElapsedTotal = 0;
        var nTests = 1;
        nTests === 1 && (verbose = 2);
        for (var i = 0; i < nTests; i++) {
            var bounds = 60.1;
            var start = new PathNode([0,0,0]);
            var goal = new PathNode([0.1,bounds,-bounds]);
            var pf = new PathFactory({
                dimensions: 3,
                maxVelocity: [10,10,10],
                maxAcceleration: [5,5,5],
                maxIterations: 7000,
            });
            msElapsedTotal += testFindPath(pf, start, goal, verbose);
        }
        nTests>1 && (msElapsedTotal/nTests).should.below(20);
        nTests>1 && console.log("findPath ms avg:", msElapsedTotal/nTests);
    })
})
