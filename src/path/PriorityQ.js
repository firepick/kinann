var mathjs = require("mathjs");

(function(exports) { 
    class PriorityQ {
        constructor(options = {}) {
            this.sizes = options.sizes || [5, 50, 500, Number.MAX_SAFE_INTEGER];
            this.split = options.split || [16,64,1024]; // split bucket when it exceeds this size
            this.b = this.sizes.map(() => []);
            this.bmax = this.sizes.map(() => null);
            this.filter = options.filter || ((v) => v);
            this.length = 0;
            this.stats = {
                fill: 0,
                split: 0,
            };
            this.compare = options.compare || ((a,b) => (a-b));
        }

        take(n, src) { // return array of n lowest values from src
            var dst = [];
            if (src) {
                src.sort((a,b) => this.compare(b,a));
                while (dst.length < n && src.length) {
                    let v = this.filter(src.pop());
                    (v != null) && dst.push(v);
                }
            }
            return dst;
        }

        fillBucket(i) {
            this.stats.fill++;
            var n = 0;
            if (0 <= i && i+1 < this.b.length) {
                if (this.b[i+1].length || this.fillBucket(i+1)) {
                    this.b[i] = this.take(this.sizes[i] || 1, this.b[i+1]);
                    if ((n = this.b[i].length)) {
                        this.bmax[i] = this.b[i][n-1];
                    }
                }
            }
            return n;
        }

        summarize(options={}) {
            var log = options.log || console.log;
            this.b.forEach((b,i) => {
                log("b["+i+"]", 
                    this.b[i].length, JSON.stringify(this.b[i].slice(0,10)), 
                    "bmax:"+this.bmax[i], 
                    "sizes:"+this.sizes[i]);
            });
        }

        validate(onErr = (()=>null)) {
            try {
                var len = this.b.reduce((acc,b) => acc + b.length,0);
                if (len !== this.length) {
                    throw new Error("length expected:"+this.length+" actual:", len);
                }
                this.b.forEach((b,i) => {
                    var max = b.reduce((acc,v) => (acc == null || this.compare(v, acc) > 0 ? v : acc), null);
                    if (max != null && max !== this.bmax[i]) {
                        throw new Error("bmax["+i+"] expected:"+max+" actual:"+this.bmax[i]);
                    }
                });
                this.bmax.forEach((m,i) => {
                    if (i > 0 && this.bmax[i] != null && this.bmax[i-1] > m) {
                        throw new Error("bmax not monotonic");
                    }
                });
            } catch(err) {
                console.log("=====", err.message, "=====");
                this.summarize();
                onErr(err);
                throw new Error(err);
            }
        }

        splitBucket(i) {
            if (this.b.length-1 <= i) {
                return null; // no more buckets
            }
            this.stats.split++;
            this.b[i].sort(this.compare);
            var bilen = this.b[i].length;
            var cut = mathjs.round(mathjs.min(this.b[i].length,this.split[i])/2);

            this.b[i+1] = this.b[i+1].concat(this.b[i].slice(cut));
            this.b[i] = this.b[i].slice(0, cut);
            this.bmax[i] = this.b[i][cut-1];
            this.bmax[i+1] == null && (this.bmax[i+1] = this.b[i+1][this.b[i+1].length-1]);

            if (this.split[i+1] && this.b[i+1].length > this.split[i+1]) {
                this.splitBucket(i+1);
            }
        }

        insert(value) {
            var nb = this.b.length;
            this.length++;
            for (var iBucket = 0; iBucket < nb; iBucket++) {
                var vmax = this.bmax[iBucket];
                if (vmax == null) {
                    this.b[iBucket].push(value);
                    this.bmax[iBucket] = value;
                    break;
                }
                if (this.compare(value,vmax) <= 0) {
                    this.b[iBucket].push(value);
                    break;
                }
            }
            if (iBucket === nb) { 
                this.bmax[nb-1] = value;
                this.b[nb-1].push(value);
            }
            if (this.split[0] && this.b[0].length > this.split[0]) {
                this.splitBucket(0);
            }
            var len = this.b.reduce((acc,b) => acc+b.length,0);
            if (len !== this.length) {
                throw new Error();
            }
            return this;
        }

        extractMin() {
            var min = null;
            if (this.length) {
                var b0new = [];
                for (var i=this.b[0].length; i-- > 0; ) {
                    var v = this.filter(this.b[0][i]);
                    if (min == null) {
                        min = v; // v can be null;
                    } else if (v != null) {
                        if (this.compare(v, min) < 0) {
                            b0new.push(min);
                            min = v;
                        } else {
                            b0new.push(v);
                        }
                    }
                }
                this.b[0] = b0new;
                if (min == null) {
                    return this.fillBucket(0) && this.extractMin();
                } 
                this.length--;
            }
            return min;
        }
    }

    module.exports = exports.PriorityQ = PriorityQ;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PriorityQ", function() {
    var should = require("should");
    var PriorityQ = exports.PriorityQ;

    it("PriorityQ(options) can have a custom comparator", function() {
        var pq = new PriorityQ({
            compare: (a,b) => a.value - b.value,
        });
        pq.insert({value:10});
        pq.insert({value:5});
        pq.insert({value:1});
        pq.insert({value:5});
        pq.extractMin().value.should.equal(1);
        pq.extractMin().value.should.equal(5);
        pq.extractMin().value.should.equal(5);
        pq.extractMin().value.should.equal(10);
    })
    it("insert() should increase length", function() {
        var pq = new PriorityQ();
        pq.length.should.equal(0);
        pq.insert(10);
        pq.insert(1);
        pq.insert(5);
    })
    it("extractMin() removes and returns smallest element", function() {
        var pq = new PriorityQ();
        pq.insert(10);
        pq.insert(5);
        pq.insert(1);
        pq.insert(5);
        pq.validate();
        pq.extractMin().should.equal(1);
        pq.validate();
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(10);
        should(pq.extractMin()).equal(null);
        pq.validate();
    })
    it("PriorityQ(options) can use multiple buckets", function() {
        var verbose = 0;
        var pq = new PriorityQ({
            sizes: [3, 3, Number.MAX_SAFE_INTEGER],
        });
        pq.validate();
        pq.insert(3);
        pq.insert(1);
        pq.insert(7);
        pq.insert(6);
        pq.insert(4);
        pq.insert(0);
        pq.insert(10);
        pq.insert(2);
        pq.insert(9);
        pq.insert(8);
        pq.insert(5);
        should.deepEqual(pq.b, [
            [3, 1, 0, 2],
            [7, 6, 4,5],
            [10, 9, 8],
        ]);
        pq.validate();
        pq.insert(11);
        should.deepEqual(pq.b, [
            [3, 1, 0, 2],
            [7, 6, 4,5],
            [10, 9, 8, 11],
        ]);
        pq.length.should.equal(12);
        var n = pq.length;
        for (var i = 0; i < n; i++) {
            var v = pq.extractMin();
            verbose && console.log("buckets", v, JSON.stringify(pq.b));
            should(v).equal(i);
            pq.length.should.equal(n-i-1);
        }
        should.deepEqual(pq.b, [
            [],
            [],
            [],
        ]);
        should(pq.extractMin()).equal(null);
    });
    it("take(n,src) return n values from src", function() {
        var pq = new PriorityQ();
        var src = [1,3,2,3,7,5];
        var dst = pq.take(0, src);
        should.deepEqual(dst, []);
        should.deepEqual(src, [7,5,3,3,2,1]);
        var dst = pq.take(3, src);
        should.deepEqual(dst, [1,2,3]); // destination is sorted
        should.deepEqual(src, [7,5,3]);
        var dst = pq.take(4, src);
        should.deepEqual(dst, [3,5,7]); // destination is sorted
        should.deepEqual(src, []);
        var dst = pq.take(3, null);
        should.deepEqual(dst, []);
    });
    it("summarize() generates summary", function() {
        var pq = new PriorityQ();
        var log = "";
        pq.summarize({
            log: (...x) => (log += JSON.stringify(x)),
        });
        log.length.should.above(50);
    });
    it("PriorityQ() can handle many items", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var n = 10000;
        function test() {
            var pq = new PriorityQ();

            var values = [];
            for (var i=0; i < n; i++) {
                v = mathjs.random(-10,10)+i/100; // random number with increasing mean
                v = mathjs.round(v, 2);
                values.push(v);
            }

            var msStart = new Date();
            values.forEach((v) => pq.insert(v));
            var msElapsed = new Date() - msStart;
            verbose>1 && console.log("insert", msElapsed);

            values.sort(pq.compare);

            verbose && console.log("pq", "max:"+pq.bmax, 
                "buckets:"+pq.b.map((b) => b.length),
                "stats:"+JSON.stringify(pq.stats),
                "");
            pq.validate();

            var msStart = new Date();
            for (var i=0; i<values.length; i++) {
                var v = pq.extractMin();
                v.should.equal(values[i]);
            }
            var msElapsed = new Date() - msStart;
            verbose>0 && console.log("extractMin", msElapsed);
        }
        for (var itest = 0; itest < 1; itest++) {
            test();
        }
    });
})
