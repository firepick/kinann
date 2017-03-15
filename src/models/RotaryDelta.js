var mathjs = require("mathjs");
var Variable = require("../Variable");
var Model = require("./Model");

(function(exports) { 

    const sqrt3 = mathjs.sqrt(3.0);
    const pi = mathjs.PI;
    const sin120 = sqrt3 / 2.0;
    const cos120 = -0.5;
    const tan60 = sqrt3;
    const sin30 = 0.5;
    const tan30 = 1 / sqrt3;
    const tan30_half = tan30 / 2.0;
    const toRadians = pi / 180.0;

class RotaryDelta extends Model {
    constructor(options={}) {
        super(["e","f","re","rf","dz"], options);
        this.cost = super.worldCost;
        this.e = options.e || 131.636; // effector equilateral triangle side
        this.f = options.f || 190.526; // base equilateral triangle side
        this.re = options.re || 270.000; // effector arm length
        this.rf = options.rf || 90.000; // base arm length
        Object.defineProperty(this, "dz", {
            value: 0, // effector z from drive plane
            writable: true,
            enumerable: true,
        });
        var zworld = this.toWorld([0,0,0]);
        this.dz = options.dz || zworld && -zworld[2];
    };

    getMinDegrees() {
        var crf = this.f / sqrt3; // base circumcircle radius
        var degrees = 180 * mathjs.asin(crf / (this.re - this.rf)) / pi - 90;
        return degrees;
    }

    toWorld(angles) {
        if (angles == null) {
            this.verbose && console.log("ERROR: toWorld(null)");
            return null;
        }
        var t = (this.f - this.e) * tan30 / 2;
        var theta = mathjs.multiply(angles, toRadians);
        var y1 = -(t + this.rf * mathjs.cos(theta[0]));
        var z1 = -this.rf * mathjs.sin(theta[0]);
        var y2 = (t + this.rf * mathjs.cos(theta[1])) * sin30;
        var x2 = y2 * tan60;
        var z2 = -this.rf * mathjs.sin(theta[1]);
        var y3 = (t + this.rf * mathjs.cos(theta[2])) * sin30;
        var x3 = -y3 * tan60;
        var z3 = -this.rf * mathjs.sin(theta[2]);
        var dnm = (y2 - y1) * x3 - (y3 - y1) * x2;
        var w1 = y1 * y1 + z1 * z1;
        var w2 = x2 * x2 + y2 * y2 + z2 * z2;
        var w3 = x3 * x3 + y3 * y3 + z3 * z3;
        // x = (a1*z + b1)/dnm
        var a1 = (z2 - z1) * (y3 - y1) - (z3 - z1) * (y2 - y1);
        var b1 = -((w2 - w1) * (y3 - y1) - (w3 - w1) * (y2 - y1)) / 2.0;
        // y = (a2*z + b2)/dnm
        var a2 = -(z2 - z1) * x3 + (z3 - z1) * x2;
        var b2 = ((w2 - w1) * x3 - (w3 - w1) * x2) / 2.0;
        // a*z^2 + b*z + c = 0
        var a = a1 * a1 + a2 * a2 + dnm * dnm;
        var b = 2.0 * (a1 * b1 + a2 * (b2 - y1 * dnm) - z1 * dnm * dnm);
        var c = (b2 - y1 * dnm) * (b2 - y1 * dnm) + b1 * b1 + dnm * dnm * (z1 * z1 - this.re * this.re);
        // discriminant
        var d = b * b - 4.0 * a * c;
        if (d < 0) { // point exists
            this.verbose && console.log("ERROR: RotaryDelta toWorld(", angles, ") point exists");
            return null;
        }
        var z = -0.5 * (b + mathjs.sqrt(d)) / a;
        return [
            (a1 * z + b1) / dnm,
            (a2 * z + b2) / dnm,
            z + this.dz,
        ]
    }

    calcAngleYZ(X, Y, Z) {
        var y1 = -tan30_half * this.f; // f/2 * tg 30
        Y -= tan30_half * this.e; // shift center to edge
        // z = a + b*y
        var a = (X * X + Y * Y + Z * Z + this.rf * this.rf - this.re * this.re - y1 * y1) / (2.0 * Z);
        var b = (y1 - Y) / Z;
        // discriminant
        var d = -(a + b * y1) * (a + b * y1) + this.rf * (b * b * this.rf + this.rf);
        if (d < 0) {
            this.verbose && console.log("RotaryDelta calcAngleYZ(", X, ",", Y, ",", Z, ") discriminant");
            return null;
        }
        var yj = (y1 - a * b - mathjs.sqrt(d)) / (b * b + 1.0); // choosing outer point
        var zj = a + b * yj;
        return 180.0 * mathjs.atan(-zj / (y1 - yj)) / pi + ((yj > y1) ? 180.0 : 0.0);
    }

    toDrive(xyz) {
        if (xyz == null) {
            this.verbose && console.log("ERROR: toDrive(null)");
            return null;
        }
        var x = xyz[0];
        var y = xyz[1];
        var z = xyz[2] - this.dz;
        var theta1 = this.calcAngleYZ(x, y, z);
        if (theta1 == null) {
            this.verbose && console.log("ERROR: toDrive(", xyz, ") theta1 is null");
            return null;
        }
        var theta2 = this.calcAngleYZ(x * cos120 + y * sin120, y * cos120 - x * sin120, z);
        if (theta2 == null) {
            this.verbose && console.log("ERROR: toDrive(", xyz, ") theta2 is null");
            return null;
        }
        var theta3 = this.calcAngleYZ(x * cos120 - y * sin120, y * cos120 + x * sin120, z);
        if (theta3 == null) {
            this.verbose && console.log("ERROR: toDrive(", xyz, ") theta3 is null");
            return null;
        }
        return [theta1,theta2,theta3];
    }

    mutate(options={}) {
        return super.mutate(options);
    }

}

    ///////////// CLASS ////////////

    module.exports = exports.RotaryDelta = RotaryDelta;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("RotaryDelta", function() {
    var should = require("should");
    RotaryDelta = exports.RotaryDelta;
    var Factory = require("../Factory");
    var Variable = require("../Variable");
    var Example = require("../Example");
    var rounder = (key,value) => typeof value == "number" ? mathjs.round(value,5) : value;

    it("has effector equilateral triangle side length option", function() {
        new RotaryDelta().e.should.equal(131.636);
        new RotaryDelta({
            e: 120
        }).e.should.equal(120);
    });
    it("has upper base equilateral triangle side length option", function() {
        new RotaryDelta().f.should.equal(190.526);
        new RotaryDelta({
            f: 120
        }).f.should.equal(120);
    });
    it("has effector arm length option", function() {
        new RotaryDelta().re.should.equal(270.000);
        new RotaryDelta({
            re: 230
        }).re.should.equal(230);
    });
    it("has effector arm length option", function() {
        new RotaryDelta().rf.should.equal(90.000);
        new RotaryDelta({
            rf: 114
        }).rf.should.equal(114);
    });
    it("has home origin offset option", function() {
        new RotaryDelta().dz.should.within(247.893, 247.894);
        new RotaryDelta({
            dz: 100
        }).dz.should.equal(100);
    });
    it("toWorld(degrees) should compute XYZ from angles ", function() {
        var rd = new RotaryDelta();
        should.deepEqual(mathjs.round(rd.toWorld([0,0,0]), 13), [0,0,0]);
        should.deepEqual(mathjs.round(rd.toWorld([1,1,1]), 4), [0,0,-1.5766]);
        should.deepEqual(mathjs.round(rd.toWorld([10,20,30]), 4), [24.5738,-41.0608,-28.7459]);
    });
    it("toDrive(xyz) should compute angles from XYZ ", function() {
        var rd = new RotaryDelta();
        should.deepEqual(mathjs.round(rd.toDrive([0,0,0]), 13), [0,0,0]);
        should.deepEqual(mathjs.round(rd.toDrive([0,0,-1.5766]),4), [1,1,1]);
        should.deepEqual(mathjs.round(rd.toDrive([24.5738,-41.0608,-28.7459]), 4), [10,20,30]);
    });
    it("getMinDegrees() should return minimum homing angle", function() {
        var rd = new RotaryDelta();
        rd.getMinDegrees().should.within(-52.33002, -52.33001);
    });
    it("eipi() should return minimum homing angle", function() {
        var expr = "exp(i*x)";
        var dexpr = mathjs.derivative(expr, "x").toString();
        return;
        console.log("dexpr:"+dexpr, "typeof"+(typeof dexpr));
        console.log("eval", mathjs.eval(dexpr,{x:0}));
        console.log("eval", mathjs.round(mathjs.eval(dexpr,{x:mathjs.PI/2}),3));
        console.log("eval", mathjs.round(mathjs.eval(dexpr,{x:mathjs.PI}),3));
        console.log("eval", mathjs.round(mathjs.eval(dexpr,{x:mathjs.PI*1.5}),3));
        console.log("eval", mathjs.round(mathjs.eval(dexpr,{x:mathjs.PI/6}),3));
        console.log("eval", mathjs.round(mathjs.norm(mathjs.eval(dexpr,{x:mathjs.PI/6})),3));
    });
    it("TESTTESTmutate(options) generates a slightly different model", function() {
        var rd1 = new RotaryDelta();
        var rate = 0.01;
        for (var ird = 0; ird < 10; ird++) {
            var mrd = rd1.mutate({rate: rate, mutation: "all"});
            var tolerance = 5*rate;
            mrd.e.should.approximately(rd1.e, tolerance*rd1.e);
            mrd.f.should.approximately(rd1.f, tolerance*rd1.f);
            mrd.rf.should.approximately(rd1.rf, tolerance*rd1.rf);
            mrd.re.should.approximately(rd1.re, tolerance*rd1.re);
            mrd.e.should.not.equal(rd1.e);
            mrd.f.should.not.equal(rd1.f);
            mrd.re.should.not.equal(rd1.re);
            mrd.rf.should.not.equal(rd1.rf);
            should(typeof mrd.dz).equal("number");
        }
    });
    it("cost(examples) returns fitness comparison", function() {
        var rdIdeal = new RotaryDelta();
        var rde1 = new RotaryDelta({
            e: rdIdeal.e + 1,
        });
        var rde2 = new RotaryDelta({
            e: rdIdeal.e + 2,
        });
        var theta = [
            new Variable([-40,40]),
            new Variable([-40,40]),
            new Variable([-40,40]),
        ];
        var examples = [
            [1,2,3], 
            [3,1,2], 
            [2,1,3], 
        ].map((input) => new Example(input, rdIdeal.toWorld(input)));
        rdIdeal.cost(examples).should.approximately(0,0.0000000000000001);
        rde1.cost(examples).should.approximately(.000182, .000001);
        rde2.cost(examples).should.approximately(.000731, .000001);
    });
    it("crossover(...parents) blends models", function() {
        var rdIdeal = new RotaryDelta();
        var rde1 = new RotaryDelta({
            e: rdIdeal.e + 1,
        });
        var rde2 = new RotaryDelta({
            e: rdIdeal.e + 2,
        });
        var rde12 = rde1.crossover(rde2);
        rde12.should.properties({
            e: (rde1.e+rde2.e)/2,
            f: rde1.f,
            re: rde1.re,
            rf: rde1.rf,
        });
        var rdall = rdIdeal.crossover(rde1,rde2);
        rdall.should.properties({
            e: (rdIdeal.e+rde1.e+rde2.e)/3,
            f: (rdIdeal.f+rde1.f+rde2.f)/3,
            re: (rdIdeal.re+rde1.re+rde2.re)/3,
            rf: (rdIdeal.rf+rde1.rf+rde2.rf)/3,
        });
    });
    it("TESTTESTevolve(examples) returns a model evolved to fit the given examples", function() {
        this.timeout(60*1000);
        var verbose = true;
        var rdTarget = new RotaryDelta({
            verbose: true,
        });
        var theta = [
            new Variable([-40,40]),
            new Variable([-40,40]),
            new Variable([-40,40]),
        ];
        var examples = [];
        var radial = true;
        if (radial) { // radial lattice is much better than random
            const sin120 = mathjs.sin(120 * mathjs.PI/180);
            const cos120 = mathjs.cos(120 * mathjs.PI/180);
            var z = -75;
            var xyz = [ 0, 0, z ];
            examples.push(new Example(rdTarget.toDrive(xyz), xyz));
            for (var radius = 10; radius <= 70; radius += 5) {
                var xyz = [ radius, 0, z ];
                examples.push(new Example(rdTarget.toDrive(xyz), xyz));
                var a = radius * cos120;
                var b = radius * sin120;
                var xyz = [ a, b, z ];
                examples.push(new Example(rdTarget.toDrive(xyz), xyz));
                var xyz = [ a, -b, z ];
                examples.push(new Example(rdTarget.toDrive(xyz), xyz));
            }
            //examples.forEach((ex) => console.log("ex", JSON.stringify(ex, rounder)));
        }
        var maxCost = 1;
        var rdStart = new RotaryDelta({ // start evolution from a different model
            e: rdTarget.e + 2,
            f: rdTarget.f + 1,
            re: rdTarget.re + 1.5,
            rf: rdTarget.rf - 1,
            verbose: true,
        });
        verbose && console.log("rdStart", JSON.stringify(rdStart, rounder));
        rdStart.cost(examples).should.above(maxCost);
        var result = rdStart.evolve(examples, {
            rate: 0.01,
            onEpoch: (result) => verbose && (result.epochs % 20 === 0) && 
                console.log("evolve...", JSON.stringify(result, rounder)),
        });
        verbose && console.log("evolve result", JSON.stringify(result, rounder));
        var rdevolve = result.model;
        verbose && console.log("mutableKeys", rdevolve.mutableKeys);
        verbose && console.log("diff f", rdevolve.e-rdTarget.e);
        verbose && console.log("diff e", rdevolve.f-rdTarget.f);
        verbose && console.log("diff rf", rdevolve.re-rdTarget.re);
        verbose && console.log("diff re", rdevolve.rf-rdTarget.rf);
        verbose && console.log("diff dz", rdevolve.dz-rdTarget.dz);
        should.deepEqual(undefined, result.error);
        rdevolve.cost(examples).should.below(0.01);
    });
    it("KNN can emulate RotaryDelta", function() {
    return; // TODO
        this.timeout(60*1000);
        var verbose = true;
        var theta = [
            new Variable([-40,40]),
            new Variable([-40,40]),
            new Variable([-40,40]),
        ];
        var xyz = [
            new Variable([-50,50]),
            new Variable([-50,50]),
            new Variable([-70,-75]),
        ];
        var rdDesign = new RotaryDelta();
        var rdActual = rdDesign.mutate({rate:0.02});
        var factory = new Factory(xyz);
        var calibrationPath = Array(120).fill().map(() => xyz.map((v) => v.sample()));
        var examplesEvolve = calibrationPath.map((world) => {
            var drive = rdDesign.toDrive(world)
            var worldActual = rdActual.toWorld(drive);
            var worldMeasured = worldActual;
            return new Example(drive, worldMeasured);
        });
        var resultEvolve = rdDesign.evolve(examplesEvolve, {
            onEpoch: (result) => verbose && (result.epochs % 50 === 0) && 
                console.log("evolve...", JSON.stringify(result)),
        });
        verbose && console.log("evolve result", JSON.stringify(resultEvolve));
        should.deepEqual(undefined, resultEvolve.error);
        var rdMeasured = resultEvolve.model;

        var examplesKNN = calibrationPath.map((world,i)=> {
            var drive = rdMeasured.toDrive(world);
            var worldMeasured = examplesEvolve[i].target;
            return new Example(world, worldMeasured);
        });
        verbose && examplesKNN.forEach((ex,i) => console.log("examplesKNN"+i,JSON.stringify(ex, rounder)));
        verbose && console.log("rdActual", JSON.stringify(rdActual, rounder));
        verbose && console.log("rdMeasured", JSON.stringify(rdMeasured, rounder));

        var knn = factory.createNetwork({
            power: 2,
            fourier: 0,
        });
        console.log("TODO propagate", knn.memoPropagate.toString().length);
        //console.log("TODO propagate", knn.memoPropagate.toString());
        var resultTrain = knn.train(examplesKNN, {
            power: 2,
            batch: 2,
            //onEpoch: (result) => (result.epochs % 10 === 0) && console.log("TODO result", JSON.stringify(result,rounder)),
        });
        verbose && console.log("train result", JSON.stringify(resultTrain));
        should.deepEqual(undefined, resultTrain.error);
    });
});
