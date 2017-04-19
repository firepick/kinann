var mathjs = require("mathjs");
var AStarGraph = require("./AStarGraph");
var PathNode = require("./PathNode");

(function(exports) { 
    
    class PathFactory extends AStarGraph {
        constructor(options={}) {
            super(options);
            this.dimensions = options.dimensions || 1;
            this.estimateFree = options.estimateFree || this.cost_tsvva;
            this.estimateConstrained = options.estimateConstrained || this.cost_explore;
            this.cost = options.cost || this.cost_constant(0.2);
            this.vMax = options.maxVelocity || Array(this.dimensions).fill(10);
            this.aMax = options.maxAcceleration || Array(this.dimensions).fill(2);
            this.jMin = options.minJerk || Array(this.dimensions).fill(0.1);
            if (options.constrain) {
                this.constrain = options.constrain;
                this.isConstrained = options.isConstrained || ((node) => true);
            } else {
                this.constrain = ((neighbor) => neighbor);
                this.isConstrained = options.isConstrained || ((node) => false);
            }
            this.onNoPath = options.onNoPath || ((start, goal) => {
                throw new Error("No path found from:"+JSON.stringify(start)+" to:"+JSON.stringify(goal));
            });
            this.jerkScale = 1; // fraction of path length
            this.jMax = this.aMax; // initial value
            this.round = 2; // force discrete graph space
            this.nodeMap = {};
            this.nodeId = 0;
            this.stats = {
                lookupTotal: 0,
                lookupHit: 0,
                tsva: 0,
                neighborsOf: 0,
            };
        }
        isCruiseNode(node) {
            return node.a.length === node.a.reduce((acc,a) => !a ? (1+acc) : acc, 0) && // not accel
                node.v.reduce((acc,v) => v ? (1+acc) : acc, 0) > 0; // moving
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
            var cullOvershoot = !node.c;
            function * iAxisAccelerations(node, i, dsgoal) {
                var ai = node.a[i];
                var aMax = pf.aMax[i];
                var aMin = -aMax;
                var jMax = pf.jMax[i];
                var aplus = ai + jMax;
                var aminus = ai - jMax;
                if (node.c) { // client must constrain neighbors
                    yield(ai); // maintain acceleration
                    aplus = aMax < aplus ? aMax : aplus;
                    aminus = aminus < aMin ? aMin : aminus;
                    if (dsgoal >= 0) { // [a, aplus, aminus]
                        ai < aplus && (yield aplus); // faster
                        aminus < ai && (yield aminus); // slower
                    } else { // [a, aminus, aplus]
                        aminus < ai && (yield aminus); // slower
                        ai < aplus && (yield aplus); // faster
                    }
                    return;
                }

                var vi = node.v[i];
                var vplus = vi + aplus;
                var vminus = vi + aminus;
                var vzero = vi + ai;
                var vMax = pf.vMax[i];
                var vMin = -vMax;
                if (dsgoal >= 0) {
                    var ds = dsgoal;
                    var dsvMax = ds < vMax ? ds : vMax; // prevent overshoot

                    (vzero <= 0 || vzero <= ds) &&
                    (vMin <= vzero && vMin <= vzero && vzero <= dsvMax) &&
                    (yield ai); // maintain acceleration

                    (vplus <= 0 || vplus <= ds) &&
                    (ai < aMax && vMin <= vplus && vplus <= dsvMax) &&
                    (yield (aMax < aplus ? aMax : aplus));
                    
                    //(vminus <= 0 || vminus <= ds) && // allow overshoot for deceleration
                    (aMin < ai && vMin <= vminus && vminus <= vMax) &&
                    (yield (aMin > aminus ? aMin : aminus));
                } else {
                    var dsvMin = vMin < dsgoal ? dsgoal : vMin; // prevent overshoot

                    (0 <= vzero || dsgoal <= vzero) &&
                    (vMin <= vzero && dsvMin <= vzero && vzero <= vMax) &&
                    (yield ai); // maintain acceleration

                    (0 <= vminus || dsgoal <= vminus) &&
                    (aMin < ai && dsvMin <= vminus && vminus <= vMax) &&
                    (yield (aMin > aminus ? aMin : aminus));

                    //(0<vplus || dsgoal <= vplus) && // allow overshoot for deceleration
                    (ai < aMax && vMin <= vplus && vplus <= vMax) &&
                    (yield (aMax < aplus ? aMax : aplus));
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
                node.c = this.isConstrained(node) ? 1 : 0;
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
            var result = super.findPath(start, goal, options);
            result.stats.start = start.s;
            result.stats.goal = goal.s;
            result.path.length || this.onNoPath(start, goal);

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
            var createNeighbor = (avariation) => {
                var vvariation = mathjs.add(node.v,avariation); // instantaneous acceleration
                var svariation = mathjs.add(node.s,vvariation); // instantaneous acceleration
                var neighbor = this.svaToNode(svariation, vvariation, avariation);
                var n = this.constrain(neighbor);
                if (n) {
                    if (this.estimateCost(neighbor, goal) < Number.MAX_SAFE_INTEGER) {
                        return n;
                    }
                } else {
                    this.onNeighbor && this.onNeighbor(neighbor,"-cn");
                }
                return null;
            }
            function* iNeighbors(pf) {
                // generate accelerations a [...[a,aup,adown]...]
                var anewbasis = node.a.map((a,i) => pf.axisAccelerations(node, i, goal.s[i]-node.s[i]));
                var neighbor;
                if (!node.c && pf.isCruiseNode(node)) { // generate restricted set of neighbors (8 for 3D)
                    var asteady = [];
                    for (var i = 0; i < anewbasis.length; i++) { 
                        var basis = anewbasis[i];
                        var a0 = basis[0];
                        if (a0 == null) {
                            return; // no values
                        }
                        asteady.push(a0); // asteady is no change in acceleration neighbor

                        // The adown neighbors decreases acceleration for all but one of the axes
                        var adown = [];
                        if (anewbasis.length === 1) {
                            adown.push(basis[basis.length-1]);
                        } else {
                            for (var j = 0; j < anewbasis.length; j++) {
                                adown.push(i===j ? basis[0] : basis[basis.length-1]);
                            }
                        }
                        (neighbor = createNeighbor(adown)) && (yield neighbor);
                    }
                    (neighbor = createNeighbor(asteady)) && (yield neighbor); // da==0
                    for (var i = 0; i < anewbasis.length; i++) { // da>0
                        var basis = anewbasis[i];
                        if (basis.length < 3) { // already generated
                            continue;
                        }
                        var aup = [];
                        for (var j = 0; j < anewbasis.length; j++) {
                            if (i==j) {
                                aup && aup.push(basis[1]);
                            } else {
                                aup && aup.push(basis[0]);
                            }
                        }
                        aup && (neighbor = createNeighbor(aup)) && (yield neighbor);
                    }
                } else { // generate all possible neighbors (27 for 3D)
                    var permutations = PathFactory.permutations(anewbasis);
                    permutations = Array.from(permutations);
                    //console.log("permutations", permutations, "anewbasis", anewbasis, "node", JSON.stringify(node));
                    for (var anew of permutations) { 
                        (neighbor = createNeighbor(anew)) && (yield neighbor);
                    }
                }
            }
            return iNeighbors(this);
        }
        tsvva(s, v1, v2, amax) {
            this.stats.tsva++;
            if (s < 0) {
                return this.tsvva(-s, -v1, -v2, amax);
            }
            var d = amax * s + 0.5*(v1*v1 + v2*v2);
            var pm = 2*mathjs.sqrt(d);
            var n1 = pm - v1 - v2;
            //var n2 = -pm - v1 - v2; // never positive
            //return (n2 < 0 ? n1 : n2)/amax;
            return n1/amax;
        }
        cost_constant(cost) {
            return (n1,n2) => n1 == n2 ? 0 : cost;
        }
        cost_distance(n1, goal) {
            var sumsquares = n1.s.reduce((acc,s,i) => {
                var diff = goal.s[i] - s;
                return acc + diff * diff;
            },0);
            return mathjs.sqrt(sumsquares);
        }
        cost_explore(n1, goal) {
            var constrained_cost = n1.v.reduce((acc,v,i) => acc + (this.vMax[i]-v)/this.vMax[i], 0); 
            return this.estimateFree(n1,goal) + constrained_cost;
        }
        cost_tsvva(n1, goal) {
            var ds = mathjs.subtract(goal.s, n1.s);
            var t = ds.map((s,i) => this.tsvva(s, n1.v[i], goal.v[i], this.aMax[i]));
            return mathjs.sum(t);
        }
        cost_tsvva_explore(n1,goal) { // explore aggressively with maximum speed
            return n1.v.reduce((acc,v,i) => 
                acc + 
                +(this.vMax[i]-v)/this.vMax[i]
                +this.tsvva(goal.s[i]-n1.s[i], n1.v[i], goal.v[i], this.aMax[i]),
                0); 
        }
        estimateCost(n1, goal) {
            if (n1.h) {
                return n1.h; // cached estimate
            }
            if (n1.c) { // constrained node
                return this.estimateConstrained(n1, goal);
            }
            return this.estimateFree(n1, goal);
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
            onCurrent: (current) => {
                if (verbose>2) {
                    var path = pf.pathTo(current);
                    console.log("path: "+path.map((node) => node.id), JSON.stringify(mathjs.round(current.s,pf.round)));
                } 
                if (verbose>3) {
                    console.log("  current:",
                        JSON.stringify(current),
                        "h:"+mathjs.round(pf.estimateCost(current, goal), pf.round),
                        pf.isCruiseNode(current) ? "cruise" : "accel",
                    "");
                }
                return true;
            },
            onNeighbor: (neighbor,outcome) => {
                if (verbose>3) {
                    var path = pf.pathTo(neighbor);
                    (verbose>4 || outcome !== "-cn") && console.log(" ",
                        outcome,
                        "nbr:",
                        JSON.stringify(neighbor),
                        "h:"+mathjs.round(pf.estimateCost(neighbor, goal), pf.round),
                        pf.isCruiseNode(neighbor) ? "cruise" : "accel",
                        "");
                }
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
        if (path.length === 0) {
            console.log("start", JSON.stringify(start));
            console.log("goal", JSON.stringify(goal));
        }
        path.length.should.above(0);
        return result;
    }

    it("PathNode(name, pos, velocity) is the constructor", function() {
        var n1 = new PathNode([1,1,1]);
        should.deepEqual(n1.v, [0,0,0]); // default velocity is zero
        var n2 = new PathNode([1,1,1], [1,2,3]);
        should.deepEqual(n2.v, [1,2,3]);
    });
    it("estimateCost(n1,n2) estimates the cost to move between the given nodes", function() {
        var vmax = 10;
        var jmax = 5;
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [vmax,vmax],
            maxAcceleration: [jmax,jmax],
        });
        pf.estimateFree.should.equal(pf.cost_tsvva); // default cost estimator
        pf.estimateConstrained.should.equal(pf.cost_explore); // default cost estimator

        var goal1 = pf.svaToNode([1,1]);
        var node = pf.svaToNode([0,0]);
        pf.isGoalNeighbor(node,goal1).should.equal(true);
        pf.estimateCost(node,goal1).should.not.equal(1); 

        var cost = pf.tsvva(100,0,0,jmax);
        pf.estimateCost(node,pf.svaToNode([100,100])).should.equal(2*cost); // sum of tsvva costs
        pf.estimateCost(node,pf.svaToNode([-100,-100])).should.equal(2*cost); // sum of tsvva costs
    })
    it("tsvva(v1, v2, amax) return minimum time for velocity change over distance", function() {
        var pf = new PathFactory();
        var sqrt2 = mathjs.sqrt(2);
        pf.tsvva(0,0,0,1).should.approximately(0,0.001); // start at rest, end at rest
        pf.tsvva(4,0,0,1).should.approximately(4,0.001); // start at rest, end at rest
        pf.tsvva(2,0,2,1).should.approximately(2,0.001); // constant acceleration from rest
        pf.tsvva(2,2,0,1).should.approximately(2,0.001); // constant acceleration to rest
        pf.tsvva(6,2,4,1).should.approximately(2,0.001); // constant acceleration with initial velocity
        pf.tsvva(0,2,-2,1).should.approximately(4,0.001); // velocity change over zero distance
        pf.tsvva(0,-2,2,1).should.approximately(4,0.001); // velocity change over zero distance
        pf.tsvva(0,3,3,1).should.approximately(0,0.001); // no velocity change over zero distance
        pf.tsvva(-4,0,0,1).should.approximately(4,0.001); // negative distance
        pf.tsvva(-2,0,-2,1).should.approximately(2,0.001); // negative distance
        pf.tsvva(-2,-2,0,1).should.approximately(2,0.001); // negative distance
        for (var i=0; i<10000; i++) {
            var v = mathjs.random(0.0001,100);
            var s = mathjs.random(0.0001,100);
            pf.tsvva(s,v,v,1).should.below(s/v); // acceleration is faster than cruising
            pf.tsvva(s,-v,v,1).should.above(pf.tsvva(s,v,v,1)); // changing directions once is slower
            pf.tsvva(s,v,-v,1).should.above(pf.tsvva(s,v,v,1)); // changing directions once is slower
            pf.tsvva(s,-v,-v,1).should.above(pf.tsvva(s,-v,v,1)); // changing directions twice is slower
            pf.tsvva(s,v,v,1).should.above(0); // postive time
            pf.tsvva(s,-v,v,1).should.above(0); // postive time
            pf.tsvva(s,v,-v,1).should.above(0); // postive time
            pf.tsvva(s,-v,-v,1).should.above(0); // postive time
        }
        pf.tsvva(3,1,1,1).should.approximately(2,0.001); // start/end same velocity over distance
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
    it("neighborsOf(node) returns fewer neighbors when cruising", function() {
        // 1 dimension
        var pf = new PathFactory({
            dimensions: 1,
            maxVelocity: [10],
            maxAcceleration: [1],
        });

        var node = new PathNode([1],[10]);
        var goal = new PathNode([100]);
        pf.isCruiseNode(node).should.equal(true);
        pf.isGoalNeighbor(node,goal).should.equal(false);

        // axis accelerations honor max velocity
        var anewbasis = node.a.map((a,i) => pf.axisAccelerations(node, i, goal.s[i]-node.s[i]));
        should.deepEqual(anewbasis,[
            [0,-1], // +1 is not included because velocity is already max
        ]);

        var neighbors = Array.from(pf.neighborsOf(node, goal));
        //neighbors.forEach((n,i) => console.log("n"+i,JSON.stringify(n)));
        neighbors.indexOf(pf.svaToNode([11],[10],[ 0])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([12],[11],[ 1])).should.not.above(-1);
        neighbors.indexOf(pf.svaToNode([10],[ 9],[-1])).should.above(-1);
        neighbors.length.should.equal(2);

        // two dimensions
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [10,10],
            maxAcceleration: [1,1],
        });

        var node = new PathNode([1,1],[10,1]);
        var goal = new PathNode([100,100]);
        pf.isCruiseNode(node).should.equal(true);
        pf.isGoalNeighbor(node,goal).should.equal(false);

        // axis accelerations honor max velocity
        var anewbasis = node.a.map((a,i) => pf.axisAccelerations(node, i, goal.s[i]-node.s[i]));
        should.deepEqual(anewbasis,[
            [0,-1], // +1 is not included because velocity is already max
            [0,1,-1],
        ]);

        var neighbors = Array.from(pf.neighborsOf(node, goal));
        //neighbors.forEach((n,i) => console.log("n"+i,JSON.stringify(n)));
        neighbors.indexOf(pf.svaToNode([11,2],[10,1],[ 0, 0])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([12,2],[11,1],[ 1, 0])).should.not.above(-1);
        neighbors.indexOf(pf.svaToNode([10,2],[ 9,1],[-1, 0])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([11,1],[10,0],[ 0,-1])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([12,1],[11,0],[ 1,-1])).should.not.above(-1);
        neighbors.indexOf(pf.svaToNode([10,1],[ 9,0],[-1,-1])).should.not.above(-1);
        neighbors.indexOf(pf.svaToNode([11,3],[10,2],[ 0, 1])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([12,3],[11,2],[ 1, 1])).should.not.above(-1);
        neighbors.indexOf(pf.svaToNode([10,3],[ 9,2],[-1, 1])).should.not.above(-1);
        neighbors.length.should.equal(4);
    })
    it("neighborsOf(node) returns goal node", function() {
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [10,10],
            maxAcceleration: [1,1],
        });

        var goal = new PathNode([-10.1,-10.1]);
        var node = new PathNode([-10,-10],[-1,-1]);
        pf.isGoalNeighbor(node, goal).should.equal(true)
        var neighbors = Array.from(pf.neighborsOf(node, goal));
        should.deepEqual(neighbors, [goal]);
    })
    it("neighborsOf(node) iterates over node neighbors", function() {
        var verbose = 0;
        var pf = new PathFactory({
            dimensions: 2,
            maxVelocity: [10,10],
            maxAcceleration: [1,1],
        });

        var goal = new PathNode([-10.1,-10.1]);
        var start = new PathNode([1,1]);
        var neighbors = Array.from(pf.neighborsOf(start, goal));
        neighbors.length.should.equal(9);
        neighbors.indexOf(pf.svaToNode([0,0],[-1,-1],[-1,-1])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([2,0],[1,-1],[1,-1])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([0,2],[-1,1],[-1,1])).should.above(-1);
        neighbors.indexOf(pf.svaToNode([2,2],[1,1],[1,1])).should.above(-1);

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
        test_iAxisAcceleration([0,0],[0,0],[0,1], 0, dsgoal, [0,-1,1]); // cull 0:stationary
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
        test_iAxisAcceleration([0,0],[10,0],[0,0], 0, dsgoal, [-1]); // overshoot
        test_iAxisAcceleration([0,0],[0,-10],[0,0], 1, dsgoal, [0,1]); // cull -1:vmax
        test_iAxisAcceleration([0,0],[10,0],[1,0], 0, dsgoal, [0]); // overshoot
        test_iAxisAcceleration([0,0],[-10,0],[-1,0], 0, dsgoal, [0]); // cull -2:vmax -1:vmax

        var dsgoal = -1; // near goal
        test_iAxisAcceleration([0,0],[0,0],[0,1], 0, dsgoal, [0,-1,1]); 
        test_iAxisAcceleration([0,0],[0,0],[0,1], 1, dsgoal, [1,0]); // cull 2:amax
        test_iAxisAcceleration([0,0],[0,0],[0,-1], 1, dsgoal, [-1,0]); // cull 2:-amax
        test_iAxisAcceleration([0,0],[-10,0],[0,0], 0, dsgoal, [1]); // overshoot
        test_iAxisAcceleration([0,0],[0,10],[0,0], 1, dsgoal, [0,-1]); // cull -1:vmax
        test_iAxisAcceleration([0,0],[-10,0],[-1,0], 0, dsgoal, [0]); // overshoot
        test_iAxisAcceleration([0,0],[10,0],[1,0], 0, dsgoal, [0]); // cull -2:vmax -1:vmax
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
            //var start = new PathNode([254.26]);
            //var goal = new PathNode([-190.32]);
            var pf = new PathFactory({
                dimensions: 1,
                maxVelocity: [20],
                maxAcceleration: [5],
                maxIterations: 400,
            });
            msElapsedTotal += testFindPath(pf, start, goal, verbose).stats.ms;
        }
        nTests>1 && (msElapsedTotal/nTests).should.below(20);
        nTests>1 && console.log("findPath 1D ms avg:", msElapsedTotal/nTests);
    })
    it("TESTTESTfindPath(start, goal) finds 3D acceleration path", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var msElapsedTotal = 0;
        var nTests = 20;
        nTests === 1 && (verbose = 2);
        for (var i = 0; i < nTests; i++) {
            var bounds = 300;
            var start = new PathNode([
                mathjs.random(-bounds,bounds),
                mathjs.random(-bounds,bounds),
                mathjs.random(-bounds,bounds),
            ]);
            var goal = new PathNode([
                mathjs.random(-bounds,bounds),
                mathjs.random(-bounds,bounds),
                mathjs.random(-bounds,bounds),
            ]);
            //var start = new PathNode([62.06,241.79,116.04]);
            //var goal = new PathNode([-154.52,241.6,44.19]);
            var pf = new PathFactory({
                dimensions: 3,
                maxVelocity: [10,10,10],
                maxAcceleration: [5,5,5],
                maxIterations: 500,
            });
            msElapsedTotal += testFindPath(pf, start, goal, verbose).stats.ms;
        }
        nTests>1 && (msElapsedTotal/nTests).should.below(100);
        nTests>1 && console.log("findPath 3D ms avg:", msElapsedTotal/nTests);
    })
    it("TESTTESTfindPath(start, goal) finds constrained path", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var msElapsedTotal = 0;
        var nTests = 2;
        nTests === 1 && (verbose = 2);
        var zcruise = 15;
        for (var i = 0; i < nTests; i++) {
            var bounds = 300;
            var start = new PathNode([200,-200,0]);
            //var goal = new PathNode([-200,200,5]);
            //var start = new PathNode([200,-200,zcruise],[0,0,1],[0,0,0]);
            var goal = new PathNode([-200,200,zcruise]);
            var pf = new PathFactory({
                dimensions: 3,
                maxVelocity: [25,25,4],
                maxAcceleration: [5,5,1],
                maxIterations: 5000,
                isConstrained: (node) => node.s[2] < zcruise,
                constrain: (n) => {
                    if (n.s[2] < 0) {
                        return null; // only paths above bed
                    }
                    if (n.s[2] < zcruise) {
                        if (n.v[0] || n.v[1] || n.a[0] || n.a[1]) {
                            return null; // no xy movement below zcruise;
                        }
                    }
                    return n;
                },
            });
            pf.estimateConstrained = pf.estimateFree; 
            var result = testFindPath(pf, start, goal, verbose);
            //result.path.forEach((n) => console.log(n.s));
            msElapsedTotal += result.stats.ms;
        }
        //nTests>1 && (msElapsedTotal/nTests).should.below(100);
        nTests>1 && console.log("findPath 3D constrained ms avg:", msElapsedTotal/nTests);
    })
})
