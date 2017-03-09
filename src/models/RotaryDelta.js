var mathjs = require("mathjs");

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

    function RotaryDelta(options) {
        var that = this;
        options = options || {};
        that.e = options.e || 131.636; // effector equilateral triangle side
        that.f = options.f || 190.526; // base equilateral triangle side
        that.re = options.re || 270.000; // effector arm length
        that.rf = options.rf || 90.000; // base arm length
        if (options.verbose) {
            that.verbose = true;
        }
        that.dz = 0; // effector z from drive plane
        that.dz = options.dz || -that.toWorld([0,0,0])[2];

        return that;
    };
    RotaryDelta.prototype.getMinDegrees = function() {
        var that = this;
        var crf = that.f / sqrt3; // base circumcircle radius
        var degrees = 180 * mathjs.asin(crf / (that.re - that.rf)) / pi - 90;
        return degrees;
    }
    RotaryDelta.prototype.toWorld = function(angles) {
        var that = this;
        var t = (that.f - that.e) * tan30 / 2;
        var theta = mathjs.multiply(angles, toRadians);
        var y1 = -(t + that.rf * mathjs.cos(theta[0]));
        var z1 = -that.rf * mathjs.sin(theta[0]);
        var y2 = (t + that.rf * mathjs.cos(theta[1])) * sin30;
        var x2 = y2 * tan60;
        var z2 = -that.rf * mathjs.sin(theta[1]);
        var y3 = (t + that.rf * mathjs.cos(theta[2])) * sin30;
        var x3 = -y3 * tan60;
        var z3 = -that.rf * mathjs.sin(theta[2]);
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
        var c = (b2 - y1 * dnm) * (b2 - y1 * dnm) + b1 * b1 + dnm * dnm * (z1 * z1 - that.re * that.re);
        // discriminant
        var d = b * b - 4.0 * a * c;
        if (d < 0) { // point exists
            that.verbose && console.log("RotaryDelta toWorld(", angles, ") point exists");
            return null;
        }
        var z = -0.5 * (b + mathjs.sqrt(d)) / a;
        return [
            (a1 * z + b1) / dnm,
            (a2 * z + b2) / dnm,
            z + that.dz,
        ]
    };
    RotaryDelta.prototype.calcAngleYZ = function(X, Y, Z) {
        var that = this;
        var y1 = -tan30_half * that.f; // f/2 * tg 30
        Y -= tan30_half * that.e; // shift center to edge
        // z = a + b*y
        var a = (X * X + Y * Y + Z * Z + that.rf * that.rf - that.re * that.re - y1 * y1) / (2.0 * Z);
        var b = (y1 - Y) / Z;
        // discriminant
        var d = -(a + b * y1) * (a + b * y1) + that.rf * (b * b * that.rf + that.rf);
        if (d < 0) {
            that.verbose && console.log("RotaryDelta calcAngleYZ(", X, ",", Y, ",", Z, ") discriminant");
            return null;
        }
        var yj = (y1 - a * b - mathjs.sqrt(d)) / (b * b + 1.0); // choosing outer point
        var zj = a + b * yj;
        return 180.0 * mathjs.atan(-zj / (y1 - yj)) / pi + ((yj > y1) ? 180.0 : 0.0);
    };
    RotaryDelta.prototype.toDrive = function(xyz) {
        var that = this;
        var x = xyz[0];
        var y = xyz[1];
        var z = xyz[2] - that.dz;
        var theta1 = that.calcAngleYZ(x, y, z);
        if (theta1 == null) {
            that.verbose && console.log("toDrive(", xyz, ") theta1 is null");
            return null;
        }
        var theta2 = that.calcAngleYZ(x * cos120 + y * sin120, y * cos120 - x * sin120, z);
        if (theta2 == null) {
            that.verbose && console.log("toDrive(", xyz, ") theta2 is null");
            return null;
        }
        var theta3 = that.calcAngleYZ(x * cos120 - y * sin120, y * cos120 + x * sin120, z);
        if (theta3 == null) {
            that.verbose && console.log("toDrive(", xyz, ") theta3 is null");
            return null;
        }
        return [theta1,theta2,theta3];
    };

    ///////////// CLASS ////////////

    module.exports = exports.RotaryDelta = RotaryDelta;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("RotaryDelta", function() {
    var should = require("should");
    RotaryDelta = exports.RotaryDelta;

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
});
