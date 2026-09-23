var SPAVersionEvaluator = Class.create();
SPAVersionEvaluator.prototype = {
    initialize: function () { },

    /**
     * Compares two semantic version strings (e.g. "120.0.1" vs "115.0.0")
     * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
     */
    compareSemVer: function (v1, v2) {
        var clean1 = (v1 || '').replace(/[^0-9.]/g, '').split('.').map(Number);
        var clean2 = (v2 || '').replace(/[^0-9.]/g, '').split('.').map(Number);
        var len = Math.max(clean1.length, clean2.length);

        for (var i = 0; i < len; i++) {
            var num1 = clean1[i] || 0;
            var num2 = clean2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    },

    /**
     * Checks if requested version satisfies the approved floor rule
     */
    isApproved: function (requestedVersion, floorRule) {
        if (!floorRule || floorRule === '*' || floorRule === '') return true;
        var cleanFloor = floorRule.replace('>=', '').trim();
        return this.compareSemVer(requestedVersion, cleanFloor) >= 0;
    },

    type: 'SPAVersionEvaluator'
};