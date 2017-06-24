var mathjs = require("mathjs");

(typeof describe === 'function') && describe("Equations", function() {
    var should = require("should");
    var Equations = require("../src/Equations");
    var https = require("https");
    var fs = require("fs");
    var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g, " ");

    it("define(sym,expr) and lookup(sym) define and retrieve named expressions", function() {
        var root = mathjs.parse("y=m*x+b");
        var eq = new Equations();
        eq.lookup(eq.define("f", "-(x)")).should.equal("-x");

        var eq = new Equations();
        eq.lookup("0").should.equal("0"); // constant literals are symbols
        eq.lookup("1").should.equal("1"); // constant literals are symbols
        eq.lookup("123").should.equal("123"); // constant literals are symbols

        // lookup may return pre-defined symbols
        eq.define("PI", mathjs.PI).should.equal("PI");
        eq.lookup("PI").should.equal("" + mathjs.PI);
        eq.define("mx", "m*x").should.equal("mx");
        eq.define("y", "m*x+b").should.equal("y");
        eq.lookup("y").should.equal("mx + b"); // note use of mx
        eq.define("z", "sin(m*x+b)").should.equal("z");
        eq.lookup("z").should.equal("sin(y)"); // note use of y

        // definitions don't change
        eq.lookup("PI").should.equal("" + mathjs.PI);
        eq.lookup("y").should.equal("mx + b");

        // sub-expressions are associated with generated symbols
        eq.lookup("_0").should.equal("m * x");
        eq.lookup("_1").should.equal("mx + b");
        eq.lookup("_2").should.equal("sin(y)");

        eq.define("zz", "sin(m*x+PI)/cos((y)^2)").should.equal("zz");
        eq.lookup("zz").should.equal("sin(mx + PI) / cos(y ^ 2)"); // note that y is used instead of "m*x+b"

        var eq = new Equations();
        eq.define("y", "(x+1)/(x-1)").should.equal("y");
        eq.lookup("y").should.equal("(x + 1) / (x - 1)"); // mathjs puts in parentheses
    });
    it("fastSimplify(node) returns simplified node tree", function() {
        var eq = new Equations();
        eq.fastSimplify(mathjs.parse("5*x*3")).toString().should.equal("15 * x");
        eq.fastSimplify(mathjs.parse("5*x*3*x")).toString().should.equal("15 * x * x");

        eq.fastSimplify(mathjs.parse("x-0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0-x")).toString().should.equal("-x");
        eq.fastSimplify(mathjs.parse("0-3")).toString().should.equal("-3");
        eq.fastSimplify(mathjs.parse("x+0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0+x")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0*x")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("x*0")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("x*1")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("1*x")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("-(x)")).toString().should.equal("-x");
        eq.fastSimplify(mathjs.parse("0/x")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("(1*x + y*0)*1+0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("sin(x+0)*1")).toString().should.equal("sin(x)");
        eq.fastSimplify(mathjs.parse("((x+0)*1)")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("sin((x-0)*1+y*0)")).toString().should.equal("sin(x)");
        eq.fastSimplify(mathjs.parse("((x)*(y))")).toString().should.equal("(x * y)");
        eq.fastSimplify(mathjs.parse("((x)*(y))^1")).toString().should.equal("(x * y)");

        // constant folding
        eq.fastSimplify(mathjs.parse("1+2")).toString().should.equal("3");
        eq.fastSimplify(mathjs.parse("2*3")).toString().should.equal("6");
        eq.fastSimplify(mathjs.parse("2-3")).toString().should.equal("-1");
        eq.fastSimplify(mathjs.parse("3/2")).toString().should.equal("1.5");
        eq.fastSimplify(mathjs.parse("3^2")).toString().should.equal("9");
    });
    it("derivative(expr, variable) generates derivative of constant and variable", function() {
        var eq = new Equations();

        // derivative of symbol
        eq.define("f1", "3");
        var dsym = eq.derivative("f1", "x");
        dsym.should.equal("f1_dx");
        eq.lookup(dsym).should.equal("0");

        // derivative of expression generates symbol as required
        var dsym = eq.derivative("y", "x");
        dsym.should.equal("0"); // pre-defined symbol

        var dsym = eq.derivative("x", "x");
        dsym.should.equal("1"); // pre-defined symbol
    });
    it("derivative(fname, variable) generates derivative of sum", function() {
        var eq = new Equations();

        eq.define("f1", "3*(x+y)");
        var dfname = eq.derivative("f1", "x");
        dfname.should.equal("f1_dx")
        eq.lookup(dfname).should.equal("3");
    });
    it("derivative(fname, variable) generates derivative of difference", function() {
        var eq = new Equations();
        eq.lookup(eq.derivative("x-y", "x")).should.equal("1");
        eq.lookup(eq.derivative("x-y", "y")).should.equal("-1");
        eq.lookup(eq.derivative("x-4", "y")).should.equal("0");
        eq.lookup(eq.derivative("4-x", "x")).should.equal("-1");
    });
    it("Equations.derivative(fname, variable) generates derivative of product", function() {
        var eq = new Equations();
        eq.lookup(eq.derivative("2*x", "x")).should.equal("2");
        eq.lookup(eq.derivative("2*x", "y")).should.equal("0");
        eq.lookup(eq.derivative("y*3", "y")).should.equal("3");
        eq.lookup(eq.derivative("x*y", "x")).should.equal("y");
        eq.lookup(eq.derivative("x*y", "y")).should.equal("x");
        eq.lookup(eq.derivative("2*x+1", "x")).should.equal("2");
        eq.lookup(eq.derivative("((x+1)*(x+2))", "x")).should.equal("x + 1 + x + 2"); // fastSimplify 

        var eq = new Equations();
        eq.define("cost", "w0b0 + w0r0c0 * x0 + w0r0c1 * x1");
        var dcost = eq.derivative("cost", "w0b0");
        eq.lookup(dcost).should.equal("1");
    });
    it("you can customize simplify()", function() {
        var eq = new Equations({
            simplify: mathjs.simplify
        });
        eq.lookup(eq.derivative("((x+1)*(x+2))", "x")).should.equal("2 * x + 3"); // mathjs simplify
        eq.lookup(eq.derivative("x/y", "x")).should.equal("1 / y");
        eq.lookup(eq.derivative("x/y", "y")).should.equal("-(x / y ^ 2)");
    });
    it("derivative(fname, variable) generates derivative of quotient", function() {
        var eq = new Equations();
        eq.lookup(eq.derivative("x/y", "x")).should.equal("y / y ^ 2");
        eq.lookup(eq.derivative("x/y", "y")).should.equal("-x / y ^ 2");
    });
    it("derivative(fname, variable) generates derivative of exponents", function() {
        var eq = new Equations();

        eq.lookup(eq.derivative("(2*x)^3", "x")).should.equal("3 * (2 * x) ^ 2 * 2");
        eq.lookup(eq.derivative("sqrt(2*x)", "x")).should.equal("0.5 * (2 * x) ^ (-0.5) * 2");
        //console.log(mathjs.derivative("3^sin(2*x)", "x")); // mathjs bug

        var eq = new Equations();
        eq.lookup(eq.derivative("3^sin(2*x)", "x")).should.equal("3 ^ sin(2 * x) * cos(2 * x) * 2 * ln(3)");
    });
    it("derivative(fname, variable) generates derivative of trigonometric functions", function() {
        var eq = new Equations();
        eq.lookup(eq.derivative("2*x+1", "x")).should.equal("2");
        eq.derivative("sin(2*x+1)", "x");
        eq.lookup(eq.derivative("sin(2*x+1)", "x")).should.equal("cos(2 * x + 1) * 2");
        eq.lookup(eq.derivative("cos(2*x+1)", "x")).should.equal("-sin(2 * x + 1) * 2");
        eq.lookup(eq.derivative("tan(2*x+1)", "x")).should.equal("sec(2 * x + 1) ^ 2 * 2");
    });
    it("derivative(fname, variable) generates derivative of hyperbolic functions", function() {
        var eq = new Equations();
        eq.lookup(eq.derivative("2*x+1", "x")).should.equal("2");
        eq.derivative("sin(2*x+1)", "x");
        eq.lookup(eq.derivative("sinh(2*x+1)", "x")).should.equal("cosh(2 * x + 1) * 2");
        eq.lookup(eq.derivative("cosh(2*x+1)", "x")).should.equal("sinh(2 * x + 1) * 2");
        eq.lookup(eq.derivative("tanh(2*x+1)", "x")).should.equal("sech(2 * x + 1) ^ 2 * 2");
    });
    it("gist computes quickly", function() {
        var verbose = false;
        var eq = new Equations();
        var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g, " ").toString();

        var msStart = new Date();
        var gistTree = mathjs.parse(gist);
        var msElapsed = new Date() - msStart;
        verbose && console.log("parse:", msElapsed);
        msElapsed.should.below(200); // typically ~17ms
        var msParsed = msElapsed;

        var msStart = new Date();
        eq.fastSimplify(gistTree);
        var msElapsed = new Date() - msStart;
        verbose && console.log("fastSimplify:", msElapsed);
        msElapsed.should.below(1.2 * msParsed); // typically ~5ms

        var msStart = new Date();
        eq.define("gist", gist).should.equal("gist");
        var msElapsed = new Date() - msStart;
        verbose && console.log("define:", msElapsed);
        msElapsed.should.below(4 * msParsed); // ~31

        var msStart = new Date();
        var gistget = eq.lookup("gist");
        var msElapsed = new Date() - msStart;
        verbose && console.log("lookup:", msElapsed);
        msElapsed.should.below(3.6 * msParsed); // typically ~63

        var msStart = new Date();
        var dfname = eq.derivative("gist", "rf");
        var msElapsed = new Date() - msStart;
        verbose && console.log("derivative rf ms:", msElapsed);
        msElapsed.should.below(1.3 * msParsed); // typically ~10ms
    })
    it("compile(fname) compiles Javascript memoization function", function() {
        var a = 3;
        var b = 5;
        var scope = {
            a: a,
            b: b
        };
        var eq = new Equations();
        eq.define("f1", "2*(a+b)+1/(a+b)");
        eq.define("f2", "a-b");

        var feval12 = eq.compile();
        var scope1 = Object.assign({}, scope);
        feval12(scope1).should.equal(scope1);
        scope1.should.properties({
            a: 3,
            b: 5,
            f1: 2 * (a + b) + 1 / (a + b),
            f2: a - b,
        });
        should(scope1.f3).equal(undefined);

        // each successive ompile() includes new equations
        eq.define("f3", "floor(exp(a))");
        eq.derivative("f2", "a");
        var scope2 = Object.assign({}, scope);
        var feval123 = eq.compile();
        feval123(scope2).should.equal(scope2);
        scope2.should.properties({
            a: 3,
            b: 5,
            f1: 2 * (a + b) + 1 / (a + b),
            f2: a - b,
            f2_da: 1, // d(a-b)/da
            f3: 20,
        });
        should(scope.f3).equal(undefined);

        // previous compile functions are unchanged 
        var scope3 = Object.assign({}, scope);
        feval12(scope3).should.properties({
            a: 3,
            b: 5,
            f1: 2 * (a + b) + 1 / (a + b),
            f2: a - b,
        });
        should(scope3.f3).equal(undefined);

        var eq = new Equations();
        eq.define("f1", "sin(x)");
        eq.define("f2", "sqrt(x)");
        eq.define("f3", "x^2");
        eq.define("f4", "-(b)");
        eq.define("f5", "-(a+b*x)");
        eq.define("f6", "1+exp(-(a+b*x))");
        should.deepEqual(eq.derivative(["f1", "f2", "f3"]), ["f1_dx", "f2_dx", "f3_dx"]);
        var feval = eq.compile();
        var x = mathjs.PI / 6;
        var a = 1;
        var b = 3;
        feval({
            x: x,
            a: a,
            b: b
        }).should.properties({
            f1: mathjs.sin(x),
            f2: mathjs.sqrt(x),
            f3: x * x,
            f4: -(b),
            f5: -(a + b * x),
            f6: 1 + mathjs.exp(-(a + b * x)),
            f1_dx: mathjs.cos(x),
            f2_dx: 0.5 / mathjs.sqrt(x),
            f3_dx: 2 * x,
        });
    });
    it("documentation example", function() {
        var eq = new Equations();
        eq.define("y", "slope*x + intercept");
        var line = eq.compile();
        var scope = {
            x: 2,
            slope: 3,
            intercept: 10
        };
        line(scope).y.should.equal(16);

        eq.derivative("y", "x").should.equal("y_dx");
        var dy = eq.lookup("y_dx");
        dy.should.equal("slope");
    });
    it("Memoization identifies common sub-expressions", function() {
        var verbose = false;
        var eq = new Equations();
        eq.define("y", "(1-x^2)*x^2");
        eq.derivative("y", "x");
        verbose && console.log("esmap", eq.exprSymbolMap);
        eq.exprSymbolMap.should.properties({
            _0: "x ^ 2",
            _1: "1 - _0",
            _2: "_1 * _0",
            _3: "2 * x",
            _4: "_1 * _0_dx",
            _5: "_0 * _1_dx",
            y: "_2",
            _0_dx: "_3",
            _1_dx: "-_0_dx",
            _2_dx: "_4 + _5",
            y_dx: "_2_dx",
        });
    });
    it("parameters() returns parameters (i.e., unbound symbols)", function() {
        var eq = new Equations();
        eq.define("s", "u * t + 0.5 * a * t^2");
        should.deepEqual(eq.parameters(), ["u", "t", "a", ]);
    });
    it("an iterator can model the trajectory of a ball toss", function() {
        var verbose = false;
        var eq = new Equations();
        eq.define("s", "u * t + 0.5 * a * t^2");
        eq.define("v", eq.derivative("s", "t"));
        eq.lookup("s_dt").should.equal("u + 0.5 * a * 2 * t");
        var feval = eq.compile();

        function* toss(velocity, acceleration) {
            var scope = {
                v: velocity,
                a: acceleration,
                t: 0,
                height: 0,
            }
            while (scope.height >= 0) {
                scope.t++;
                scope.u = scope.v;
                feval(scope);
                scope.height += scope.s;
                yield scope;
            }
        }

        var ball = toss(20, -1);
        for (let state of ball) {
            verbose && console.log("height", state.t, state.height);
            state.t === 1 && state.should.properties({
                s: 19.5,
                v: 19
            });
            state.t === 2 && state.should.properties({
                s: 36,
                v: 17
            });
        }
    });
})
