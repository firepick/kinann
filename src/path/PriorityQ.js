var mathjs = require("mathjs");

(function(exports) { 
    class PriorityQ {
        constructor(options = {}) {
            this.sizes = options.sizes || [1, 10, 100, 1000, Number.MAX_SAFE_INTEGER];
            this.buckets = Array(this.sizes.length).fill(null).map(() => []);
            this.bucketMax = Array(this.sizes.length).fill(null);
            this.filter = options.filter || ((v) => v);
            this.length = 0;
            this.compare = options.compare || ((a,b) => (a-b));
        }

        fillBucket(iBucket) {
            if (this.buckets.length-1 <= iBucket) {
                return null; // no more buckets
            }
            var n = this.sizes[iBucket];
            if (this.buckets[iBucket].length) {
                console.log("nonempty", this.buckets[iBucket]);
            }
            var b1;
            var b2;
            var transfer = () => {
                b1 = this.buckets[iBucket] = [];
                b2 = this.buckets[iBucket+1].sort((a,b) => this.compare(b,a));
                var v;
                var bucketMax = null;
                while (b1.length < n && null != (v = b2.pop())) {
                    if (null != (v = this.filter(v))) {
                        b1.push(v);
                        if (bucketMax && bucketMax > v) {
                            console.log("max", bucketMax, v);
                        }
                        bucketMax = v;
                    }
                }
                this.bucketMax[iBucket] = bucketMax;
                return b1.length;
            }

            transfer() || (b2 = this.fillBucket(iBucket+1)) && transfer();

            return b1;
        }

        insert(value) {
            var nb = this.buckets.length;
            this.length++;
            for (var iBucket = 0; iBucket < nb; iBucket++) {
                var vmax = this.bucketMax[iBucket];
                if (vmax == null) {
                    this.buckets[iBucket].push(value);
                    this.bucketMax[iBucket] = value;
                    return this;
                }
                if (this.compare(value,vmax) <= 0) {
                    this.buckets[iBucket].push(value);
                    return this;
                }
            }
            this.bucketMax[nb-1] = value;
            this.buckets[nb-1].push(value);
            return this;
        }

        extractMin() {
            var min = null;
            if (this.length) {
                var b = this.buckets[0];
                var bnew = [];
                for (var i=b.length; i-- > 0; ) {
                    var v = this.filter(b[i]);
                    if (min == null) {
                        min = v; // v can be null;
                    } else if (v != null) {
                        if (this.compare(v, min) < 0) {
                            bnew.push(min);
                            min = v;
                        } else {
                            bnew.push(v);
                        }
                    }
                }
                this.buckets[0] = bnew;
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

    it("TESTTESTPriorityQ(options) can have a custom comparator", function() {
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
    it("TESTTESTinsert() should increase length", function() {
        var pq = new PriorityQ();
        pq.length.should.equal(0);
        pq.insert(10);
        pq.insert(1);
        pq.insert(5);
    })
    it("TESTTESTextractMin() removes and returns smallest element", function() {
        var pq = new PriorityQ();
        pq.insert(10);
        pq.insert(5);
        pq.insert(1);
        pq.insert(5);
        pq.extractMin().should.equal(1);
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(10);
        should(pq.extractMin()).equal(null);
    })
    it("TESTTESTPriorityQ(options) can use multiple buckets", function() {
        var verbose = 0;
        var pq = new PriorityQ({
            sizes: [3, 3, Number.MAX_SAFE_INTEGER],
        });
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
        should.deepEqual(pq.buckets, [
            [3, 1, 0, 2],
            [7, 6, 4,5],
            [10, 9, 8],
        ]);
        pq.insert(11);
        should.deepEqual(pq.buckets, [
            [3, 1, 0, 2],
            [7, 6, 4,5],
            [10, 9, 8, 11],
        ]);
        pq.length.should.equal(12);
        var n = pq.length;
        for (var i = 0; i < n; i++) {
            var v = pq.extractMin();
            verbose && console.log("buckets", v, JSON.stringify(pq.buckets));
            should(v).equal(i);
            pq.length.should.equal(n-i-1);
        }
        should.deepEqual(pq.buckets, [
            [],
            [],
            [],
        ]);
        should(pq.extractMin()).equal(null);
    });
    it("TESTTESTPriorityQ() can handle many items", function() {
        this.timeout(60*1000);
        var verbose = 0;
        var n = 10000;
        var pq = new PriorityQ({
            sizes: [1, 10, 100, 1000, Number.MAX_SAFE_INTEGER],
        });
        var values = [];
        for (var i=0; i < n; i++) {
            var v = mathjs.round(mathjs.random(-10,10)+i/100); // random number with increasing mean
            values.push(v);
        }

        var msStart = new Date();
        for (var i=0; i < n; i++) {
            pq.insert(values[i]);
        }
        var msElapsed = new Date() - msStart;
        console.log("insert", msElapsed);

        var msStart = new Date();
        values.sort((a,b) => a - b);
        var msElapsed = new Date() - msStart;
        console.log("sort", msElapsed);

        console.log("pq", "max:"+pq.bucketMax, "buckets:"+pq.buckets.map((b) => b.length));

        var msStart = new Date();
        for (var i=0; i<values.length; i++) {
            var v = pq.extractMin();
            if (v != values[i]) {
                console.log("BAD", i, v, values[i]);
            }
            v.should.equal(values[i]);
        }
        var msElapsed = new Date() - msStart;
        console.log("extractMin", msElapsed);
    });
})
