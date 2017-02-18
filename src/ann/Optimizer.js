var should = require("should");
var mathjs = require("mathjs");

(function(exports) {

    ////////////////// constructor
    Optimizer = function() {
        var that = this;
        that.findex = 0;
        that.emap = {};
        that.memo = {};
        return that;
    }

    Optimizer.prototype.optimize = function(expr) {
        var that = this;
        if (expr instanceof Array) {
            return expr.map((e) => that.optimize(e));
        }
        var root = mathjs.parse(expr);
        var eroot = root.toString();
        var fname = that.emap[eroot];
        if (!fname) {
            var ememo = eroot;
            root.traverse((node, path, parent) => {
                if (node.isParenthesisNode && parent) {
                    var e = node.toString();
                    !that.emap[e] && that.optimize(e);
                }
            });
            for (var i = 0; i < that.findex; i++) { // apply accumulated optimizations
                var fsub = "f" + i;
                var subExpr = that.memo[fsub];
                if (subExpr[0] === '(' && ememo.indexOf(subExpr) >= 0) {
                    ememo = ememo.split(subExpr).join("(" + fsub + ")"); // eliminate sub-expressions
                }
            }
            fname = "f" + that.findex++;
            that.memo[fname] = ememo;
            that.emap[eroot] = fname;
        }

        return fname;
    }

    Optimizer.prototype.compile = function() {
        var that = this;
        var body = "";
        for (var i = 0; i < that.findex; i++) {
            var fname = "f" + i;
            var root = mathjs.parse(that.memo[fname]);
            root = root.transform((node, path, parent) => {
                if (node.isSymbolNode) {
                    node.name = "$." + node.name;
                } else if (node.isFunctionNode) {
                    node.fn.name = "math." + node.fn.name;
                } else if (node.isOperatorNode && node.op === "^") { // Javscript doesn't have "^"
                    return new mathjs.expression.node.FunctionNode("math.pow", node.args);
                }
                return node;
            });
            body += "\n  $." + fname + " = " + root.toString() + ";";
        }
        body += "\n  return $.f" + (that.findex - 1) + ";\n";
        // use Function to create a function with "math" in its lexical environment
        return (new Function("math", "return function($) {" + body + "}"))(mathjs);
    }

    module.exports = exports.Optimizer = Optimizer;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Optimizer", function() {
    var Optimizer = exports.Optimizer; // require("./Optimizer");

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
