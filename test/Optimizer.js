var should = require("should");
var mathjs = require("mathjs");
var Optimizer = require("../src/Optimizer");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Optimizer", function() {

    it("Optimizer.optimize(expr) returns memoized expression name", function() {
        var opt = new Optimizer();

        opt.optimize("2*(a+b)+1/(a+b)").should.equal("f1");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",
            f1: "2 * (f0) + 1 / (f0)",
        });

        // re-optimization of expressions matching existing optimizations has no effect 
        opt.optimize("2*(a + b)+1/(a+b)").should.equal("f1");

        // optimizations accumulate
        opt.optimize("((a+b)*(b+c)+1/(a + exp(b+c)))").should.equal("f4");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",
            f1: "2 * (f0) + 1 / (f0)",
            f2: "(b + c)",
            f3: "(a + exp(f2))",
            f4: "((f0) * (f2) + 1 / (f3))",
        });

        // vector optimizations are supported
        should.deepEqual(
            opt.optimize(["(a+b)", "(b+c)", "3*(a+b)"]), ["f0", "f2", "f5"]
        );
        opt.memo.f5.should.equal("3 * (f0)");
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

        opt.optimize("floor(exp(a))").should.equal("f2"); // mathjs functions
        opt.optimize("(a+b)^a").should.equal("f3"); // non-Javascript operator

        var f3 = opt.compile(); // memoize all currently optimized functions 
        f3(scope).should.equal(512);
        should.deepEqual(scope, {
            a: 3,
            b: 5,
            f0: 8,
            f1: 16.125,
            f2: 20,
            f3: 512,
        });
    });
})
