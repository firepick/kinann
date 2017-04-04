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

    class Trajectory extends AStarGraph {
        constructor(options={}) {
            super(options);
            this.dimensions = options.dimensions || 1;
            this.vMax = options.maxVelocity || Array(this.dimensions).fill(10);
            this.aMax = options.maxAcceleration || Array(this.dimensions).fill(2);
            this.jMax = options.maxJerk || Array(this.dimensions).fill(1);
            this.a0 = Array(this.dimensions).fill(0);
            this.goalDistSquared = this.jMax.reduce((sum, j) => sum + j*j, 0);
            this.nodeMap = {};
        }
        getNode(position, velocity, acceleration) {
            var node = new PathNode(position, velocity, acceleration);
            var key = JSON.stringify(node);
            return (this.nodeMap[key] = this.nodeMap[key] || node);
        }
        axisAccelerations(node, i) {
            Trajectory.validateNode(node);
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
        isNearGoal(node, goal) { // a goal is zero-velocity
            for (var i = 0; i < this.dimensions; i++) {
                var jMax = this.jMax[i];
                var ds = goal.s[i] - node.s[i];
                var v = node.v[i];
                var dv = 0 - v;
                var a = node.a[i];

                if (ds < -jMax || jMax < ds) {
                    return false; // too far
                }
                if (v < -jMax || jMax < v) {
                    return false; // too fast
                }
                if (a < -jMax || jMax < a) {
                    return false; // too jerky
                }
                if (v < 0 && ds > 0 || v > 0 && ds < 0) {
                    return false; // wrong way velocity
                }
                if (dv > 0 && a < 0 || dv < 0 && a > 0) {
                    return false; // wrong way acceleration
                }
            }
            return true;
        }
        neighborsOf(node, goal) {
            Trajectory.validateNode(node);
            if (goal && this.isNearGoal(node, goal)) {
                return [goal];
            }
            var da = node.a.map((a,i) => this.axisAccelerations(node, i));
            var apermutations = Trajectory.permutations(da).map((dai) => {
                var avariation = mathjs.add(node.a,dai);
                var vvariation = mathjs.add(node.v,avariation);
                var svariation = mathjs.add(node.s,vvariation);
                return this.getNode(svariation, vvariation, avariation);
            });
            return apermutations;
        }
        distSquared(n1, n2) {
            return mathjs.subtract(n1.s, n2.s).reduce((sum, diff) => sum + diff * diff, 0);
        }
        estimateCost(n1, n2) {
            return this.distSquared(n1, n2);
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

    module.exports = exports.Trajectory = Trajectory;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("Trajectory", function() {
    var should = require("should");
    var Trajectory = exports.Trajectory;
    var PathNode = Trajectory.PathNode;

    it("Trajectory(options) is the constructor", function() {
    })
    it("PathNode(name, pos, velocity) is the constructor", function() {
        var n1 = new PathNode([1,1,1]);
        should.deepEqual(n1.v, [0,0,0]); // default velocity is zero
        var n2 = new PathNode([1,1,1], [1,2,3]);
        should.deepEqual(n2.v, [1,2,3]);
    });
    it("estimateCost(n1,n2) estimates the cost to move between the given nodes", function() {
        var trajectory = new Trajectory();
        var n1 = new PathNode([1,3,2]);
        var n2 = new PathNode([3,1,4]);
        trajectory.estimateCost(n1,n2).should.equal(12);  
    })
    it("getNode(s,v,a) returns unique node with given attributes", function() {
        var trj = new Trajectory({
            dimensions: 2,
        });
        var n1 = trj.getNode([1,2],[3,4],[5,6]);
        var n2 = trj.getNode([1,2],[3,4],[5,6]);
        n1.should.equal(n2);
        n1.should.instanceOf(PathNode);
    })
    it("axisAccelerations(node, i) returns possible neighbor accelerations", function() {
        var trj = new Trajectory({
            dimensions: 2,
            maxVelocity: [10, 100],
            maxAcceleration: [4, 5],
            maxJerk: [1, 2],
        });
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[0,0],[0,1]), 0), [1,0,-1]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[0,0],[1,1]), 0), [2,1,0]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[0,0],[4,1]), 0), [4,3]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[0,0],[-4,1]), 0), [-3,-4]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[10,0],[0,0]), 0), [0,-1]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[-10,0],[0,0]), 0), [1,0]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[10,0],[1,0]), 0), [0]);
        should.deepEqual(trj.axisAccelerations(trj.getNode([0,0],[-10,0],[-2,0]), 0), []);
    })
    it("permutations(vv) generates permutations", function() {
        should.deepEqual(Trajectory.permutations([[1,2],[3,4,5]]), [
            [1,3],
            [2,3],
            [1,4],
            [2,4],
            [1,5],
            [2,5],
        ]);
        should.deepEqual(Trajectory.permutations([[1,2],[],[3,4,5]]), []);
    })
    it("neighborsOf(node) generates node neighbors", function() {
        var trj = new Trajectory({
            dimensions: 2,
        });
        var start = new PathNode([1,1]);
        var neighbors = trj.neighborsOf(start);
        neighbors.length.should.equal(9);
        neighbors[0].should.equal(trj.getNode([2,2],[1,1],[1,1]));
        neighbors[1].should.equal(trj.getNode([1,2],[0,1],[0,1]));
        neighbors[2].should.equal(trj.getNode([0,2],[-1,1],[-1,1]));
        neighbors[8].should.equal(trj.getNode([0,0],[-1,-1],[-1,-1]));
    })
    it("TESTTESTisNearGoal(node, goal) returns true if goal is reachable in one step from node", function() {
        var trj = new Trajectory({
            dimensions: 2,
            maxVelocity: [100,100],
            maxAcceleration: [2,2],
            maxJerk: [1,1],
        });
        var goal = new PathNode([1,1]);
        trj.isNearGoal(goal, goal).should.equal(true);

        trj.isNearGoal(trj.getNode([0,0]), goal).should.equal(true);
        trj.isNearGoal(trj.getNode([2,0]), goal).should.equal(true);
        trj.isNearGoal(trj.getNode([2,2]), goal).should.equal(true);
        trj.isNearGoal(trj.getNode([0,2]), goal).should.equal(true);

        trj.isNearGoal(trj.getNode([0,0],[1,1]), goal).should.equal(true); // can stop
        trj.isNearGoal(trj.getNode([2,2],[-1,-1]), goal).should.equal(true); // can stop
        trj.isNearGoal(trj.getNode([0,0],[1.1,1.1]), goal).should.equal(false); // too fast
        trj.isNearGoal(trj.getNode([0,0],[-1.1,-1.1]), goal).should.equal(false); // too fast
        trj.isNearGoal(trj.getNode([0,0],[1,1],[-1,-1]), goal).should.equal(true); // can decelerate
        trj.isNearGoal(trj.getNode([2,2],[-1,-1],[1,1]), goal).should.equal(true); // can decelerate
        trj.isNearGoal(trj.getNode([0,0],[1,1],[-1.1,-1.1]), goal).should.equal(false); // too jerky
        trj.isNearGoal(trj.getNode([2,2],[1,1],[1.1,1.1]), goal).should.equal(false); // too jerky
        trj.isNearGoal(trj.getNode([0,0],[-1,-1]), goal).should.equal(false); // wrong velocity direction
        trj.isNearGoal(trj.getNode([2,2],[1,1]), goal).should.equal(false); // wrong velocity direction
        trj.isNearGoal(trj.getNode([0,0],[1,1],[1,1]), goal).should.equal(false); // wrong acceleration direction
        trj.isNearGoal(trj.getNode([2,2],[-1,-1],[-1,-1]), goal).should.equal(false); // wrong acceleration direction
    })
    it("neighborsOf(node, goal) generates goal node if near", function() {
        var trj = new Trajectory({
            dimensions: 2,
        });
        var goal = new PathNode([1,1]);
        var neighbors = trj.neighborsOf(goal);
        neighbors.forEach((n) => {
            var vinverse = mathjs.multiply(-1, n.v);
            var ninverse = trj.getNode(n.s, vinverse); 
            var nn = trj.neighborsOf(ninverse, goal);
            nn.length.should.equal(1, JSON.stringify(n));
            nn[0].should.equal(goal);
        });
        var close = trj.getNode(mathjs.add([0.1,0.1], goal.s), trj.vMax, trj.aMax);
    })
})
