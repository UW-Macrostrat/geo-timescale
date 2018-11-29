/*
TODO
FIX HASH, accesable from external
Time ticks for level 4 periods when zoomed to level 3
*/

// Via http://stackoverflow.com/questions/14167863/how-can-i-bring-a-circle-to-the-front-with-d3
// Necessary for highlighting time intervals properly
d3.selection.prototype.moveToFront = function() {
  return this.each(function(){
    this.parentNode.appendChild(this);
  });
};

const timescale = (function() {

  // Via https://stackoverflow.com/questions/38224875/replacing-d3-transform-in-d3-v4
  function getTranslation(transform) {
    // Create a dummy g for calculation purposes only. This will never
    // be appended to the DOM and will be discarded once this function 
    // returns.
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Set the transform attribute to the provided string value.
    g.setAttributeNS(null, "transform", transform);
    
    // consolidate the SVGTransformList containing all transformations
    // to a single SVGTransform of type SVG_TRANSFORM_MATRIX and get
    // its SVGMatrix. 
    const matrix = g.transform.baseVal.consolidate().matrix;
    
    // As per definition values e and f are the ones for the translation.
    return [matrix.e, matrix.f];
  }

  // Via https://stackoverflow.com/questions/9133500/how-to-find-a-node-in-a-tree-with-javascript
  function searchTree(node, property, match){
    if (property === "nam" || "oid" || "mid" || "lag" || "") {
      if (node.data[property] == match){
        return node;
      } else if (node.children != null){
          let result = null;
          for (let i=0; result == null && i < node.children.length; i++) {
            result = searchTree(node.children[i], property, match);
          }
          return result;
      }
      return null;
    } else {
      console.warn("Property can't be used to search")
    }
  }

  const width = 960;
  const height = 130;

  // Initialize data
  const data = { oid: 0, nam: "Geologic Time", children: [] };
  const interval_hash = { 0: data };
  let currentInterval;
  let root;
  let dragStart;
  let transformStart;

  return {

    "init": function(div) {
      let newX = 0.01;

      const drag = d3.drag()
        .subject(function() { 
          // const t = d3.select(".timescale g");
          return {x: newX, y: 0};
        })
        .on("start", function() {
        	dragStart = event.pageX;
          transformStart = getTranslation(d3.select(".timescale").select("g").attr("transform"));

          d3.event.sourceEvent.stopPropagation();
        })
        .on("drag", function() {
        	currentDrag = event.pageX;

         	newX = (dragStart - currentDrag);

          d3.select(".timescale").select("g")
            .attr("transform", function() {
              return `translate(${[ parseInt(transformStart[0] + -newX), 0 ]}) scale(${parseInt(d3.select(".timescale").style("width"))/961})`;
            });        
        });
      
      // Add class timescale to whatever div was supplied
      d3.select("#" + div).attr("class", "timescale");

      // Create the SVG for the chart
      const time = d3.select("#" + div).append("svg")
          .attr("width", width)
          .attr("height", height)
          .append("g");

      // Move whole tick SVG group down 125px
      const scale = time.append("g")
        .attr("id", "tickBar")
        .attr("transform", "translate(0,125)");

      // Create a new d3 partition layout
      const partition = d3.partition()
        .size([width, height])
        .padding(0);

      // Load the time scale data
      d3.json("intervals.json").then(function(result) {

        // Construct hierarchy variable 'data' by oid's from paleoJSON
        result.records.forEach(i => {
          i.children = [];
          i.pid = i.pid || 0; // Check if i is not a highest level period
          i.abr = i.abr || i.nam.charAt(0);
          i.mid = parseInt((i.eag + i.lag) / 2); //length of period
          i.total = i.eag - i.lag;
          interval_hash[i.oid] = i;
          interval_hash[i.pid].children.push(i);
        })
        
        root = d3.hierarchy(data)
          .sum(d => (d.children.length === 0) ? d.total + 0.117 : 0 ); //? add time for Holocene

        console.log(
          {result}, 
          {interval_hash},
          {data},   // created hierarchy
          {root}  // d3 hierarchy with Node types
          )

        partition(root);

        const rectGroup = time.append("g")
          .attr("id", "rectGroup");

        // Create the rectangles
        rectGroup.selectAll("rect")
            .data( root.descendants() )
          .enter().append("rect")
            .attr("x", function(d) { return d.x0; })
            .attr("y", function(d) { return d.y0; })
            .attr("width", function(d) { return d.x1 - d.x0; })
            .attr("height", function(d) { return d.y1 - d.y0; })
            .attr("fill", function(d) { return d.data.col || "#000"; })
            .attr("id", function(d) { return "t" + d.data.oid; })
            .style("opacity", 0.83)
            .call(drag)
            .on("click", function(d) { console.log(d); timescale.goTo(d); });

        // Scale bar for the bottom of the graph
        const scaleBar = scale.selectAll("rect")
          .data(root.descendants());

        const hash = scaleBar.enter().append("g")
          .attr("class", function(d) { return "tickGroup s" + d.data.lvl})
          .attr("transform", function(d) { return `translate(${d.x0}, 0)`}); 

        hash.append("line")
          .attr("x1", 0)
          .attr("y1", 7.5)
          .attr("x2", 0)
          .attr("y2", 12)
          .style("stroke-width", "0.05em");

        hash.append("text")
          .attr("x", 0)
          .attr("y", 20)
          .style("text-anchor", function(d) { return (d.data.eag !== 0.0117) ? "middle" : "end"; })
          .style("font-size", "0.65em")
          .style("fill", "#000")
          .text(function(d) { return d.data.eag; });

        // Create a tick for year 0
        const now = scale.append("g")
          .data([{x0: width, y0: 0 }])
          .attr("class", "tickGroup s1 s2 s3 s4 s5")
          .attr("transform","translate(960, 0)");

        now.append("line")
          .attr("x1", 0)
          .attr("y1", 7.5)
          .attr("x2", 0)
          .attr("y2", 12)
          .style("stroke-width", "0.05em");

        now.append("text")
          .attr("x", 0)
          .attr("y", 20)
          .attr("id", "now")
          .style("fill", "white")
          .style("text-anchor", "end")
          .style("font-size", "0.65em")
          .style("fill", "#777")
            .text("0");

        const textGroup = time.append("g")
          .attr("id", "textGroup");

        // Add the full labels
        textGroup.selectAll("fullName")
            .data( root.descendants() )
          .enter().append("text")
            .text(function(d) { return d.data.nam; })
            .attr("x", 1)
            .attr("y", function(d) { return d.y0 + 15;})
            .attr("width", function() { return this.getComputedTextLength(); })
            .attr("height", function(d) { return d.y1 - d.y0; })
            .attr("class", function(d) { return "fullName level" + d.data.lvl; })
            .attr("id", function(d) { return "l" + d.data.oid; })
            .attr("x", function(d) { return timescale.labelX(d); })
            .on("click", function(d) { timescale.goTo(d); });

        // Add the abbreviations
        textGroup.selectAll("abbrevs")
            .data( root.descendants() )
          .enter().append("text")
            .attr("x", 1)
            .attr("y", function(d) { return d.y0 + 15; })
            .attr("width", 30)
            .attr("height", function(d) { return d.y1 - d.y0; })
            .text(function(d) { return d.data.abr; }) //charAt(0)
            .attr("class", function(d) { return "abbr level" + d.data.lvl; })
            .attr("id", function(d) { return "a" + d.data.oid; })
            .attr("x", function(d) { return timescale.labelAbbrX(d); })
            .on("click", function(d) { console.log(d); timescale.goTo(d); });

        // Position the labels for the first time
        timescale.goTo(root);

        // Remove the Geologic time abbreviation
        d3.select(".abbr.levelundefined").remove();
        
        // Open to Phanerozoic 
        timescale.goTo("Phanerozoic");
      }); // End PaleoDB json callback
      //attach window resize listener to the window
      d3.select(window).on("resize", timescale.resize);

      // Size time scale to window
      timescale.resize();
    },

    // Calculates x-position for label abbreviations
    "labelAbbrX": function(d) {
      var rectWidth = parseFloat(d3.select("#t" + d.data.oid).attr("width")),
          rectX = parseFloat(d3.select("#t" + d.data.oid).attr("x"));

      let labelWidth = d3.select("#a" + d.data.oid).node().getComputedTextLength();

      if (rectWidth - 8 < labelWidth) {
        d3.select("#a" + d.data.oid).style("display", "none");
      }

      return rectX + (rectWidth - labelWidth) / 2;
    },
    
    "labelX": function(d) {
      const rectWidth = d.x1 - d.x0;
            rectX = d.x0;

      let labelWidth;
      try {
        labelWidth = d3.select("#l" + d.data.oid).node().getComputedTextLength();
      } catch(err) {
        labelWidth = 25;
      }

      // Hide full names if they are too small for their rectangles
      if (rectWidth - 10 < labelWidth) {
        d3.select("#l" + d.data.oid).style("display", "none");
      } else {
        d3.select("#a" + d.data.oid).style("display", "none");
      }

      return rectX + (rectWidth - labelWidth) / 2;
    },

    // Zooms the graph to a given time interval
    // Accepts a data point or a named interval
    "goTo": function(d) {
      // console.group("goTo", d);
      if (typeof d == "string") {
        console.log("goto is a a string")
        d = searchTree(root, "nam", d)
      } else if (d.children) {
        // console.log("clicked node has children!")
          if (d.children.length < 1) {
            const d = d.data.parent;
          }
      }
      // console.groupEnd()

      // Stores the currently focused time interval for state restoration purposes
      timescale.currentInterval = d;

      d3.selectAll(".fullName")
      .style("display", "block");

      d3.selectAll(".abbr")
        .style("display", "block");
      
      // Adjust the bottom scale
      const depth = (d.depth !== 'undefined') ? parseInt(d.depth) + 1 : 1;
      d3.selectAll(".scale").style("display", "none");
      d3.selectAll(".tickGroup").style("display", "none");
      d3.selectAll(".s" + depth).style("display", "block");

      const x = d3.scaleLinear()
        .range([5, width])
        .domain([d.x0, d.x1]); 

      // Define transition for concurrent animation
      const t = d3.transition()
        .duration(300)
        .ease(d3.easeLinear);

      // Transition the rectangles
      d3.selectAll("rect").transition(t)
        .attr("x", function(d) { return x(d.x0); })
        .attr("width", function(d) { return x(d.x1) - x(d.x0); })    

      // Transition tick groups
      d3.selectAll(".tickGroup").transition(t)
        .attr("transform", function(d) {
          d3.select(this).selectAll("text").style("text-anchor", "middle");
          if (x(d.x0) === 5) {
            d3.select(this).select("text")
              .style("text-anchor", "start");
          } else if (d.x0 === width) {
            d3.select(this).select("text")
              .style("text-anchor", "end");
          }
          if (typeof x(d.x0) === 'number') {return `translate(${x(d.x0)}, 0)`}
        });
        
      // Move the full names, to keep animation concurrent labelX has to be calculated inside to goTo function
      d3.selectAll(".fullName").transition(t)
        .attr("x", function(d) { 
            const rectWidth = x(d.x1) - x(d.x0),
                  rectX = x(d.x0);

            let labelWidth;
            try {
              labelWidth = d3.select("#l" + d.data.oid).node().getComputedTextLength(); //this?
            } catch(err) {
              labelWidth = 25;
            }

            if (rectWidth - 8 < labelWidth) {
              d3.select("#l" + d.data.oid).style("display", "none");
           } else {
             d3.select("#a" + d.data.oid).style("display", "none");
           }

            return rectX + (rectWidth - labelWidth) / 2;
        })
        .attr("height", function(d) { return d.y1 - d.y0; })

      //Move the abbreviations
      d3.selectAll(".abbr").transition(t)
        .attr("x", function(d) {
          const rectWidth = x(d.x1) - x(d.x0),
                rectX = x(d.x0);

          let abbrevWidth = d3.select("#a" + d.data.oid).node().getComputedTextLength();
          
          if (rectWidth - 8 < abbrevWidth) {
            d3.select("#a" + d.data.oid).style("display", "none");
          }
          
          return rectX + (rectWidth - abbrevWidth) / 2;
        })
        .attr("height", function(d) { return d.y1 - d.y0; })
        .on("end", function() { 
          d3.selectAll(".fullName").style("fill", "#333");
          d3.selectAll(".abbr").style("fill", "#333");
        });

      // Center whichever interval was clicked
      d3.select("#l" + d.data.oid).transition(t)
        .attr("x", width/2);

      // Position all the parent labels in the middle of the scale
      if (d.parent !== null) {
        const depth = d.depth;
        let loc = "d.parent";
        for (let i=0; i < depth; i++) {
          const parent = eval(loc).data.nam;
          d3.selectAll('.abbr').filter(d => d.data.nam === parent ).transition(t)
            .attr("x", width/2);
          d3.selectAll('.fullName').filter(d => d.data.nam === parent ).transition(t)
            .attr("x", width/2);
          loc += ".parent";
        }
        d3.selectAll('.abbr').filter(d => d.data.nam === parent).transition(t)
          .attr("x", width/2);
        d3.selectAll('.fullName').filter(d => d.data.nam === parent).transition(t)
          .attr("x", width/2);
      }        

      timescale.resize();
    },

    // Highlight a given time interval
    "highlight": function(d) {

      d3.selectAll("rect").style("stroke", "#fff");
      if (d.cxi) {
        let id = d.cxi;
        d3.selectAll("rect#t" + d.cxi).style("stroke", "#000").moveToFront();
        d3.selectAll("#l" + d.cxi).moveToFront();
      } else if (typeof d == "string") {
        let id = d3.selectAll('rect').filter(function(e) {
          return e.nam === d;
        }).attr("id");
        id = id.replace("t", "");
      } else {
        let id = d3.select(d).attr("id");
        id = id.replace("p", "");
      }

      d3.selectAll(`rect#t${id}`).style("stroke", "#000").moveToFront();
      d3.selectAll("#l" + id).moveToFront();
      d3.selectAll(".abbr").moveToFront();
    },

    // Unhighlight a time interval by resetting the stroke of all rectangles
    "unhighlight": function() {
      d3.selectAll("rect").style("stroke", "#fff");
    },

    "resize": function() {
      d3.select(".timescale g")
        .attr("transform", function() {
          return `scale(${parseInt(d3.select(".timescale").style("width"))/961})`;
        });

      d3.select(".timescale svg")
        .style("width", function() { return d3.select(".timescale").style("width"); })
        .style("height", function() { return parseInt(d3.select(".timescale").style("width")) * 0.25 + "px"; });
    },

    /* Interval hash can be exposed publically so that the time scale data can be used 
       for other things, such as maps */
    // https://github.com/d3/d3-hierarchy/issues/58 
    "interval_hash": interval_hash, 

    // Method for getting the currently zoomed-to interval - useful for preserving states
    "currentInterval": currentInterval
  }
})();