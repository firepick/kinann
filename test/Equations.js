var mathjs = require("mathjs");

(typeof describe === 'function') && describe("Equations", function() {
    var should = require("should");
    var Equations = require("../src/Equations");
    var https = require("https");
    var fs = require("fs");
    var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g," ");

    it("takes time", function() {
        console.log("NOTE: running all tests will take >20 seconds");
    })
    it("set(sym,expr) and get(sym) define and retrieve named expressions", function() {
        var root = mathjs.parse("y=m*x+b");
        var eq = new Equations();
        eq.get(eq.set("f", "-(x)")).should.equal("-x");

        var eq = new Equations();
        eq.get("0").should.equal("0"); // constant literals are symbols
        eq.get("1").should.equal("1"); // constant literals are symbols
        eq.get("123").should.equal("123"); // constant literals are symbols

        // if equations are set in dependency order, then symbols will automatically be inserted into get
        eq.set("PI", mathjs.PI).should.equal("PI");
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.set("mx", "m*x").should.equal("mx");
        eq.set("y", "m*x+b").should.equal("y");
        eq.get("y").should.equal("mx + b");  // not "sin(m*x + b)" !
        eq.set("z", "sin(m*x+b)").should.equal("z");
        eq.get("z").should.equal("sin(y)"); // not "sin(m * x + b)" !

        // definitions don't change
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.get("y").should.equal("mx + b"); 

        // sub-expressions are associated with generated symbols
        eq.get("_0").should.equal("m * x"); 
        eq.get("_1").should.equal("mx + b"); 
        eq.get("_2").should.equal("sin(y)"); 

        eq.set("zz", "sin(m*x+PI)/cos((m*x + b)^2)").should.equal("zz");
        eq.get("zz").should.equal("sin(mx + PI) / cos(y ^ 2)"); // note that y is used instead of "m*x+b"

        var eq = new Equations();
        eq.set("y", "(x+1)/(x-1)").should.equal("y");
        eq.get("y").should.equal("(x + 1) / (x - 1)"); // mathjs puts in parentheses

        var msStart = new Date();
    });
    it("fastSimplify(node) returns simplified node tree", function() {
        var eq = new Equations();
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
    });
    it("derivative(expr, variable) generates derivative of constant and variable", function() {
        var eq = new Equations();

        // derivative of symbol
        eq.set("f1", "3");
        var dsym = eq.derivative("f1", "x");
        dsym.should.equal("f1_dx");
        eq.get(dsym).should.equal("0");

        // derivative of expression generates symbol as required
        var dsym = eq.derivative("y", "x");
        dsym.should.equal("0");  // pre-defined symbol

        var dsym = eq.derivative("x", "x");
        dsym.should.equal("1"); // pre-defined symbol
    });
    it("derivative(fname, variable) generates derivative of sum", function() {
        var eq = new Equations();

        eq.set("f1", "3*(x+y)");
        var dfname = eq.derivative("f1", "x");
        dfname.should.equal("f1_dx")
        eq.get(dfname).should.equal("3");
    });
    it("derivative(fname, variable) generates derivative of difference", function() {
        var eq = new Equations();
        eq.get(eq.derivative("x-y", "x")).should.equal("1");
        eq.get(eq.derivative("x-y", "y")).should.equal("-1");
        eq.get(eq.derivative("x-4", "y")).should.equal("0");
        eq.get(eq.derivative("4-x", "x")).should.equal("-1");
    });
    it("Equations.derivative(fname, variable) generates derivative of product", function() {
        var eq = new Equations();
        eq.get(eq.derivative("2*x", "x")).should.equal("2");
        eq.get(eq.derivative("2*x", "y")).should.equal("0");
        eq.get(eq.derivative("y*3", "y")).should.equal("3");
        eq.get(eq.derivative("x*y", "x")).should.equal("y");
        eq.get(eq.derivative("x*y", "y")).should.equal("x");
        eq.get(eq.derivative("2*x+1", "x")).should.equal("2"); 
        eq.get(eq.derivative("((x+1)*(x+2))", "x")).should.equal("x + 1 + x + 2"); // fastSimplify 

        var eq = new Equations({
            simplify: mathjs.simplify
        });
        eq.get(eq.derivative("((x+1)*(x+2))", "x")).should.equal("2 * x + 3"); // mathjs simplify

        var eq = new Equations();
        eq.set("cost", "w0b0 + w0r0c0 * x0 + w0r0c1 * x1");
        var dcost = eq.derivative("cost", "w0b0");
        eq.get(dcost).should.equal("1");
    });
    it("derivative(fname, variable) generates derivative of quotient", function() {
        var eq = new Equations();
        eq.get(eq.derivative("x/y", "x")).should.equal("y / y ^ 2"); 
        eq.get(eq.derivative("x/y", "y")).should.equal("-x / y ^ 2"); 

        var eq = new Equations({
            simplify: mathjs.simplify,
        });
        eq.get(eq.derivative("x/y", "x")).should.equal("1 / y"); 
        eq.get(eq.derivative("x/y", "y")).should.equal("-(x / y ^ 2)"); 
    });
    it("derivative(fname, variable) generates derivative of exponents", function() {
        var eq = new Equations();

        eq.get(eq.derivative("(2*x)^3", "x")).should.equal("3 * (2 * x) ^ 2 * 2"); 
        eq.get(eq.derivative("sqrt(2*x)", "x")).should.equal("0.5 * (2 * x) ^ (-0.5) * 2"); 
        //console.log(mathjs.derivative("3^sin(2*x)", "x")); // mathjs bug

        var eq = new Equations();
        eq.get(eq.derivative("3^sin(2*x)", "x")).should.equal("3 ^ sin(2 * x) * cos(2 * x) * 2 * ln(3)"); 
    });
    it("derivative(fname, variable) generates derivative of trigonometric functions", function() {
        var eq = new Equations();
        eq.get(eq.derivative("2*x+1", "x")).should.equal("2"); 
        eq.derivative("sin(2*x+1)", "x");
        eq.get(eq.derivative("sin(2*x+1)", "x")).should.equal("cos(2 * x + 1) * 2"); 
        eq.get(eq.derivative("cos(2*x+1)", "x")).should.equal("-sin(2 * x + 1) * 2"); 
        eq.get(eq.derivative("tan(2*x+1)", "x")).should.equal("sec(2 * x + 1) ^ 2 * 2"); 
    });
    it("derivative(fname, variable) generates derivative of hyperbolic functions", function() {
        var eq = new Equations();
        eq.get(eq.derivative("2*x+1", "x")).should.equal("2"); 
        eq.derivative("sin(2*x+1)", "x");
        eq.get(eq.derivative("sinh(2*x+1)", "x")).should.equal("cosh(2 * x + 1) * 2"); 
        eq.get(eq.derivative("cosh(2*x+1)", "x")).should.equal("sinh(2 * x + 1) * 2"); 
        eq.get(eq.derivative("tanh(2*x+1)", "x")).should.equal("sech(2 * x + 1) ^ 2 * 2"); 
    });
    it("gist computes quickly", function() {
        var verbose = false;
        var eq = new Equations();
        var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g," ").toString();

        var msStart = new Date();
        var gistTree = mathjs.parse(gist);
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(200); // typically ~17ms

        //var msStart = new Date();
        //mathjs.simplify(gistTree);
        //console.log("simplify ms", new Date() - msStart); // typically ~1600ms

        var msStart = new Date();
        eq.fastSimplify(gistTree);
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(100); // typically ~5ms

        var msStart = new Date();
        eq.set("gist", gist).should.equal("gist");
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(1000); // typically ~63
        verbose && console.log("set:", new Date() - msStart);

        var msStart = new Date();
        var dfname = eq.derivative("gist", "rf");
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(200); // typically ~10ms
        verbose && console.log("derivative ms:", msElapsed);
    })
    it("compile(fname) compiles Javascript memoization function", function() {
        var a = 3;
        var b = 5;
        var scope = {a:a,b:b};
        var eq = new Equations();
        eq.set("f1", "2*(a+b)+1/(a+b)");
        eq.set("f2", "a-b");

        var feval12 = eq.compile(); 
        var scope1 = Object.assign({}, scope);
        feval12(scope1).should.equal(scope1);
        scope1.should.properties({
            a: 3,
            b: 5,
            f1: 2*(a+b)+1/(a+b),
            f2: a-b,
        });
        should(scope1.f3).equal(undefined);

        // each successive ompile() includes new equations
        eq.set("f3", "floor(exp(a))");
        eq.derivative("f2","a");
        var scope2 = Object.assign({}, scope);
        var feval123 = eq.compile();
        feval123(scope2).should.equal(scope2);
        scope2.should.properties({
            a: 3,
            b: 5,
            f1: 2*(a+b)+1/(a+b),
            f2: a-b,
            f2_da: 1, // d(a-b)/da
            f3: 20,
        });
        should(scope.f3).equal(undefined);

        // previous compile functions are unchanged 
        var scope3 = Object.assign({}, scope);
        feval12(scope3).should.properties({
            a: 3,
            b: 5,
            f1: 2*(a+b)+1/(a+b),
            f2: a-b,
        });
        should(scope3.f3).equal(undefined);

        var eq = new Equations();
        eq.set("f1", "sin(x)");
        eq.set("f2", "sqrt(x)");
        eq.set("f3", "x^2");
        eq.set("f4", "-(b)");
        eq.set("f5", "-(a+b*x)");
        eq.set("f6", "1+exp(-(a+b*x))");
        should.deepEqual(eq.derivative(["f1","f2","f3"]), ["f1_dx", "f2_dx", "f3_dx"]);
        var feval = eq.compile();
        var x = mathjs.PI/6;
        var a = 1;
        var b = 3;
        feval({x: x, a:a, b:b}).should.properties({
            f1: mathjs.sin(x),
            f2: mathjs.sqrt(x),
            f3: x * x,
            f4: -(b),
            f5: -(a+b*x),
            f6: 1+mathjs.exp(-(a+b*x)),
            f1_dx: mathjs.cos(x),
            f2_dx: 0.5/mathjs.sqrt(x),
            f3_dx: 2*x,
        });
    });
    it("documentation example", function() {
        var eq = new Equations();
        eq.set("y", "slope*x + intercept");
        var line = eq.compile();
        var scope = {
            x:2, 
            slope:3, 
            intercept:10
        };
        line(scope).y.should.equal(16);

        eq.derivative("y","x").should.equal("y_dx");
        var dy = eq.get("y_dx");
        dy.should.equal("slope");
    });
})
