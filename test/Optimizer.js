var should = require("should");
var mathjs = require("mathjs");
var Optimizer = require("../src/Optimizer");
var fs = require("fs");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Optimizer", function() {

    it("Optimizer.optimize(expr) returns memoized expression name", function() {
        var opt = new Optimizer();
        opt.optimize("2*(a+b)+1/(a+b)+sin(a+b)").should.equal("f2");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",
            f1: "sin(f0)",
            f2: "2 * (f0) + 1 / (f0) + f1",
        });

        // re-optimization of expressions matching existing optimizations has no effect 
        opt.optimize("2*(a + b)+1/(a+b)+sin(a+b)").should.equal("f2");

        // optimizations accumulate
        opt.optimize("((a+b)*(b+c)+1/(a + exp(b+c)))").should.equal("f6");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",                  // old
            f1: "sin(f0)",                  // old
            f2: "2 * (f0) + 1 / (f0) + f1", // old
            f3: "(b + c)",                  // new
            f4: "exp(f3)",                  // new
            f5: "(a + f4)",                 // new
            f6: "((f0) * (f3) + 1 / (f5))", // new
        });

        // vector optimizations are supported
        var opt = new Optimizer();
        should.deepEqual(
            opt.optimize(["(a+b)", "(b+c)", "3*(a+b)"]), ["f0", "f1", "f2"]
        );
        opt.memo.f2.should.equal("3 * (f0)");

        var opt = new Optimizer();
        opt.optimize("2").should.equal("f0");
        should.deepEqual(opt.optimize("((w0b0+w0r0c0*x0+w0r0c1*x1-yt0)^2+(w0b1+w0r1c0*x0+w0r1c1*x1-yt1)^2)/2"), "f4");
        should.deepEqual(opt.memo, {
            f0: "2",
            f1: "(w0b0 + w0r0c0 * x0 + w0r0c1 * x1 - yt0)",
            f2: "(w0b1 + w0r1c0 * x0 + w0r1c1 * x1 - yt1)",
            f3: "((f1) ^ 2 + (f2) ^ 2)",
            f4: "(f3) / 2",
        });
        var opt = new Optimizer();
        opt.optimize("a*(x+1)").should.equal("f1");
        opt.optimize("a*(x+1)+2").should.equal("f2");
        opt.optimize("a*(x+1)+3").should.equal("f3");
        should.deepEqual(opt.memo, {
            f0: "(x + 1)",
            f1: "a * (f0)",
            f2: "f1 + 2",
            f3: "f1 + 3",
        });
    });
    it("Optimizer.compile(fname) compiles Javascript memoization function", function() {
        var opt = new Optimizer();
        var scope = {
            a: 3,
            b: 5
        };
        opt.optimize("2*(a+b)+1/(a+b)").should.equal("f1");
        var f1 = opt.compile(); // memoize all currently optimized functions
        should.deepEqual(scope, {
            a: 3,
            b: 5,
        });
        f1(scope).should.equal(16.125);
        should.deepEqual(scope, {
            a: 3,
            b: 5,
            f0: 8,
            f1: 16.125,
            // f2,f3 not present
        });

        opt.optimize("floor(exp(a))").should.equal("f3"); // mathjs functions
        opt.optimize("(a+b)^a").should.equal("f4"); // non-Javascript operator

        var f3 = opt.compile(); // memoize all currently optimized functions 
        f3(scope).should.equal(512);
        should.deepEqual(scope, {
            a: 3,
            b: 5,
            f0: 8,
            f1: 16.125,
            f2: 20.085536923187668,
            f3: 20,
            f4: 512,
        });
    });
    it("Optimizer.derivative(fname, variable) generates derivative of constant and variable", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("3");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal(fname + "_dx")
        opt.memo[dfname].should.equal("0");

        var fname = opt.optimize("y");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal(fname + "_dx")
        opt.memo[dfname].should.equal("0");

        var fname = opt.optimize("x");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal(fname + "_dx")
        opt.memo[dfname].should.equal("1");
    });
    it("Optimizer.derivative(fname, variable) generates derivative of sum", function() {
        var opt = new Optimizer();

        var fname = opt.optimize("3+(x+y)");
        fname.should.equal("f1");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal(fname + "_dx")
        opt.memo[dfname].should.equal("f0_dx");
        should.deepEqual(opt.memo, {
            f0: "(x + y)",
            f0_dx: "1",
            f1: "3 + (f0)",
            f1_dx: "f0_dx",
        });
        var opteval = opt.compile();
        var scope = {
            x: 31,
            y: 27,
        };
        var result = opteval(scope);
        should.deepEqual(scope, {
            f0: 58,
            f0_dx: 1,
            f1: 61,
            f1_dx: 1,
            x: 31,
            y: 27,
        });
    });
    it("Optimizer.pruneNode(node, parent) returns pruned node tree", function() {
        var opt = new Optimizer();
        opt.pruneNode(mathjs.parse("x-0")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("0-x")).toString().should.equal("0 - x");
        opt.pruneNode(mathjs.parse("0-3")).toString().should.equal("-3");
        opt.pruneNode(mathjs.parse("x+0")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("0+x")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("0*x")).toString().should.equal("0");
        opt.pruneNode(mathjs.parse("x*0")).toString().should.equal("0");
        opt.pruneNode(mathjs.parse("x*1")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("1*x")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("0/x")).toString().should.equal("0");
        opt.pruneNode(mathjs.parse("(1*x + y*0)*1+0")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("sin(x+0)*1")).toString().should.equal("sin(x)");
        opt.pruneNode(mathjs.parse("((x+0)*1)")).toString().should.equal("x");
        opt.pruneNode(mathjs.parse("sin((x-0)*1+y*0)")).toString().should.equal("sin(x)");
        opt.pruneNode(mathjs.parse("((x)*(y))")).toString().should.equal("(x * y)");
    });
    it("Optimizer.derivative(fname, variable) generates derivative of difference", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("x-y");
        var dfname = opt.derivative(fname, "x");
        var dfname = opt.derivative(fname, "y");
        should.deepEqual(opt.memo, {
            f0: "x - y",
            f0_dx: "1",
            f0_dy: "-1",
        })
    });
    it("Optimizer.derivative(fname, variable) generates derivative of product", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("2*x");
        var dfname = opt.derivative(fname, "x");
        var fname = opt.optimize("y*3");
        var dfname = opt.derivative(fname, "y");
        var fname = opt.optimize("x*y");
        var dfname = opt.derivative(fname, "x");
        var dfname = opt.derivative(fname, "y");
        var fname = opt.optimize("((x+1)*(x+2))");
        var dfname = opt.derivative(fname, "x");
        should.deepEqual(opt.memo, {
            f0: "2 * x",
            f0_dx: "2",
            f1: "y * 3",
            f1_dy: "3",
            f2: "x * y",
            f2_dx: "y",
            f2_dy: "x",
            f3: "(x + 1)",
            f3_dx: "1",
            f4: "(x + 2)",
            f4_dx: "1",
            f5: "((f3) * (f4))",
            f5_dx: "(f3 * f4_dx + f4 * f3_dx)",
        });
    });
    it("Optimizer.derivative(fname, variable) generates derivative of quotient", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("x/y");
        var dfname = opt.derivative(fname, "x");
        var dfname = opt.derivative(fname, "y");
        should.deepEqual(opt.memo, {
            f0: "x / y",
            f1: "y ^ 2", // denominator is optimized
            f0_dx: "(0 - y) / f1",
            f0_dy: "x / f1",
        })
    });
    it("TESTTESTOptimizer.derivative(fname, variable) generates derivative of constant powers", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("(2*x)^3");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal("f1_dx");
        var fname = opt.optimize("sqrt(2*x)");
        var dfname = opt.derivative(fname, "x");
        should.deepEqual(opt.memo, {
            f0: "(2 * x)",
            f1: "(f0) ^ 3",
            f2: "(f0)",
            f3: "3 * (f2) ^ 2",
            f4: "sqrt(f2)",
            f4_dx: "f5 * f2_dx",
            f5: "0.5 * f2 ^ (-0.5)",
            f0_dx: "2",
            f1_dx: "f3 * f0_dx",
            f2_dx: "f0_dx",
        });
    });
    it("Optimizer.derivative(fname, variable) generates derivative of trigonometric functions", function() {
        var opt = new Optimizer();
        var fname = opt.optimize("sin((2*x+1))");
        var dfname = opt.derivative(fname, "x");
        dfname.should.equal("f1_dx");
        var fname = opt.optimize("cos((2*x+1))");
        var dfname = opt.derivative(fname, "x");
        should.deepEqual(opt.memo, {
            f0: "(2 * x + 1)",
            f1: "sin((f0))",
            f2: "(f0)",
            f3: "cos((f2))",
            f4: "f3",
            f5: "(f2)",
            f6: "sin((f5))",
            f0_dx: "2",
            f1_dx: "f3 * f0_dx",
            f2_dx: "f0_dx",
            f3_dx: "-f6 * f2_dx",
            f4_dx: "f3_dx",
        });
    });
    it("erivative() works on gist", function() {
        var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g," ");
        var opt = new Optimizer();
        var msStart = new Date();
        var fname = opt.optimize(gist);
        //console.log("optimize ms:", new Date() - msStart);
        var msStart = new Date();
        var dfname = opt.derivative(fname, "x");
        //console.log("derivative ms:", new Date() - msStart);
    })
})
