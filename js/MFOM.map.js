/*
    Moore Foundation Ocean Map
    MFOM.map.js
    Map View for Ocean Map
*/

(function(exports) {
    'use strict';
    var MFOM = exports.MFOM || (exports.MFOM = {});

    // Map utilities
    function getRadiusByZoom(zoom) {
        //return (Math.pow(2,zoom))/2; // base 2 keeps them same geographical size. Dividing by 2 makes that size smaller
        return (Math.pow(1.7,zoom))/2; // base < 2 means they get bigger as you zoom, but not as big as the geography does
    }

    MFOM.map = function(selector) {
        var __ = {};

        var overlayMaps,markerList;

        var hash = STA.hasher.getMapState(STA.hasher.get());

        var initialLocation = (hash && hash[0]) ? hash[0] : [35, -105],
            initialZoom = (hash && hash[1]) ? hash[1] : MFOM.config.map.startZoom;

        var map = L.map(selector, {
                crs: MFOM.config.map.crs,
                continuousWorld: false,
                worldCopyJump: false,
                scrollWheelZoom: false,
                layers: [MFOM.config.map.mapboxTilesLowZoom, MFOM.config.map.mapboxTilesHighZoom]
            })
            .setView(initialLocation, initialZoom);

        var layerControl;
        var selectedCountry = null;
        var layerControlReset = false;
        var groups = [];

        map.on('zoomend', function() {
            if (!markerList) return;

            var currentZoom = map.getZoom();
            markerList.forEach(function(marker) {
                marker.setRadius(getRadiusByZoom(currentZoom));
                //console.log(currentZoom, getRadiusByZoom(currentZoom));
            });
        });
        map.on('moveend', onMoveEndHandler, self);

        map.on('click', function(e) {
          // This click event only fires if the user clicks somewhere not on a feature.
          map.closePopup();
        });

        map.on('overlayremove overlayadd', function(type, obj) {
            if (layerControlReset) return;
            console.log("OVERLAY ADD OR REMOVE: ", type, obj);
            getAvailableGroups();
            if (currentFilters) __.filterOn(currentFilters);
        });

        function onMoveEndHandler(e) {
            var center = map.getCenter(),
                zoom = map.getZoom();
            var h = STA.hasher.get();

            if (h.intro) return;
            STA.hasher.setMapState(center, zoom);
        };

        function geojsonStyle(feature) {
            return feature.properties.Status == "Pre-planning" ? MFOM.config.styles.geojsonPolyStylePreplanning : MFOM.config.styles.geojsonPolyStyle;
        }

        function onEachFeature(feature, layer) {
            return;
            if (feature && feature.hasOwnProperty("properties") && feature.properties && feature.properties.hasOwnProperty("Location")) {
                var html = feature.properties.Location + "<br>" + feature.properties.Status + "<br>" + feature.properties['Narrative (250, no formatting or links)'];
            } else {
                var html = "Location not found";
            }
            layer.bindPopup(html);
        }

        function showTip(e) {
            var props = e.target.properties || null;
            var html = "Location not found";
            if (props && props.hasOwnProperty("Location")) {
                html = props.Location;
            }

            var hover_bubble = new L.Rrose({ offset: new L.Point(0,-10), closeButton: false, autoPan: false })
              .setContent(html)
              .setLatLng(e.latlng)
              .openOn(map);
            //popupOpen = true;
        }

        function hideTip() {
            //popupOpen = false;
            map.closePopup();
        }


        function setupOverlays(layers) {
            layers.sort(function(a, b) { return d3.ascending(+a.csv_id, +b.csv_id);})
                .forEach(function(lyr) {
                    lyr.layer = new L.GeoJSON(lyr.geojson, {
                        style: geojsonStyle,
                        onEachFeature: onEachFeature
                    });

                    //map.addLayer(lyr.layer);

                    lyr.layer.on('mouseover mousemove', function(e){
                        if (lyr.layer.selected) return;
                        showTip(e);
                        lyr.layer.setStyle(MFOM.config.styles.geojsonPolyMouseover);

                    });

                    lyr.layer.on('mouseout', function(e){
                        hideTip();
                        if (lyr.layer.selected) return;
                        lyr.layer.setStyle(lyr.geojson.features[0].properties.Status == "Pre-planning" ? MFOM.config.styles.geojsonPolyStylePreplanning : MFOM.config.styles.geojsonPolyStyle);
                    });

                    lyr.layer.on('click', function(e){
                        hideTip();
                        var props = lyr.layer.properties;
                        var h = STA.hasher.get();
                        // If current ID is already selected, reset selections to nothing
                        if (h.id == props['ID'])
                          h.id = null;
                        else
                          h.id = props['ID'];
                        STA.hasher.set(h);
                    });


                    var label = lyr.geojson.features[0].properties.Location;
                    if (!label) label = "no shape";
                    lyr.layer.properties = lyr.geojson.features[0].properties;
                    var overlayKey = lyr.csv_id + ": " + label;

                    lyr.layer.lookupKey = overlayKey
                    overlayMaps[overlayKey] = lyr.layer;

                });

        }

        /*
        d3.selectAll('.leaflet-control-layers-selector')
        .each(function(item){
          var value = this.checked,
            group = this.getAttribute('data-group');
          console.log(group, value);
        });
        */

        var availableGroups = {};
        function getAvailableGroups() {
            availableGroups = {};
            if(!layerControl) return;
            var root = d3.select('.leaflet-control-layers-overlays');
            layerControl._groupList.forEach(function(country) {
                if (!availableGroups.hasOwnProperty(country))availableGroups[country] = {};

                var group = root.select('[data-group="' + country + '"]');
                group.selectAll('.leaflet-control-layers-selector')
                    .each(function(){
                        var value = this.checked,
                        l = this.getAttribute('data-grouplayer');

                        availableGroups[country][l] = value;
                    });
            });

        }


        function groupOverlays() {
            layerControlReset = true;
            if (layerControl) {
                layerControl.removeAllLayers();
                map.removeControl(layerControl);
            }
            layerControl = null;

            var o = {};
            for (var overlay in overlayMaps) {
                var lyr = overlayMaps[overlay];
                var props = lyr.properties;
                var country = props.Country,
                    scale = props.Scale,
                    label = props.Location,
                    layerName = lyr.lookupKey;

                if (selectedCountry && country.toLowerCase() !== selectedCountry.toLowerCase()) continue;


                if (!o.hasOwnProperty(country)) o[country] = {};
                if (!o[country].hasOwnProperty(scale)) o[country][scale] = new L.LayerGroup();

                overlayMaps[layerName].addTo(o[country][scale]);
            }

            // add layers as groups
            for (var country in o) {
                for (var scale in o[country]) {
                    map.addLayer(o[country][scale]);
                }
            }

            // add group control
            layerControl = L.control.groupedLayers(null, o);
            map.addControl(layerControl);
            layerControlReset = false;
            exports.layerControl = layerControl;
            getAvailableGroups()
        }

        // Create point map layers for any rows that have lat & lon
        function setupPoints(eezs) {
            eezs.sort(function(a,b) { return d3.ascending(+a.ID, +b.ID);})
                .forEach(function(row) {
                    if (!row.Latitude || !row.Longitude) return;

                    var overlayKey = row.ID + ": " + row.Location;
                    if (overlayKey in overlayMaps) return; // Skip if this area already has a shape loaded

                    var layer = L.geoJson({
                            "type": "Feature",
                            "properties": row,
                            "geometry": {
                                "type": "Point",
                                "coordinates": [row.Longitude, row.Latitude]
                            }
                        }, {
                            pointToLayer: function(feature, latlng) {
                                var circleMarker = L.circleMarker(latlng, row.Status == "Pre-planning" ? MFOM.config.styles.geojsonMarkerOptionsPreplanning : MFOM.config.styles.geojsonMarkerOptions);
                                markerList.push(circleMarker);
                                circleMarker.setRadius(getRadiusByZoom(MFOM.config.map.startZoom));
                                return circleMarker;
                            },
                            onEachFeature: onEachFeature
                        });

                    //map.addLayer(layer);


                    layer.on("mouseover", function (e) {
                        if (layer.selected) return;
                        showTip(e);
                        layer.setStyle(MFOM.config.styles.geojsonMarkerMouseover);
                    });

                    layer.on("mouseout", function (e) {
                        hideTip(e);
                        if (layer.selected) return;
                        layer.setStyle(e.layer.feature.properties.Status == "Pre-planning" ? MFOM.config.styles.geojsonMarkerOptionsPreplanning : MFOM.config.styles.geojsonMarkerOptions);
                    });

                    layer.on('click', function(e){
                        hideTip();
                        var props = layer.properties;
                        var h = STA.hasher.get();
                        // If current ID is already selected, reset selections to nothing
                        if (h.id == props['ID'])
                          h.id = null;
                        else
                          h.id = props['ID'];
                        STA.hasher.set(h);
                    });

                    layer.lookupKey = overlayKey;

                    layer.properties = row;
                    overlayMaps[overlayKey] = layer;

                });
        }

        function addOverlayControl() {
            // group layers
            groupOverlays()
        }

        // call onMoveEndHandler to set map coordinates to hash
        onMoveEndHandler();

        __.highlightOverlay = function(data) {
            var id = data['ID'] || null;
            for(var overlay in overlayMaps) {
                var props = overlayMaps[overlay].properties;

                if (props['ID'] === id) {
                    overlayMaps[overlay].selected = true;
                    if ('pointToLayer' in overlayMaps[overlay].options) // Test if it's a point overlay
                      overlayMaps[overlay].setStyle(MFOM.config.styles.geojsonMarkerHighlighted);
                    else
                      overlayMaps[overlay].setStyle(MFOM.config.styles.geojsonPolyHighlighted);
                } else {
                    overlayMaps[overlay].selected = false;
                    if ('pointToLayer' in overlayMaps[overlay].options) // Test if it's a point overlay
                      overlayMaps[overlay].setStyle(props['Status'] == "Pre-planning" ? MFOM.config.styles.geojsonMarkerOptionsPreplanning : MFOM.config.styles.geojsonMarkerOptions);
                    else
                      overlayMaps[overlay].setStyle(props['Status'] == "Pre-planning" ? MFOM.config.styles.geojsonPolyStylePreplanning : MFOM.config.styles.geojsonPolyStyle);
                }

            }
        };

        var currentFilters = null;
        __.filterOn = function(filters) {
            currentFilters = filters;
            for(var overlay in overlayMaps) {
                var props = overlayMaps[overlay].properties;

                if (selectedCountry && !availableGroups.hasOwnProperty(props.Country)) continue;
                if (!availableGroups[props.Country][props.Scale]) continue;

                var valid = true,
                    value;
                filters.forEach(function(k) {
                    if (k.value) {
                        value = k.value
                        if (k.key === 'Status') {
                            value = MFOM.config.statusLookup[k.value] || null;
                        }

                        if (value instanceof RegExp) {
                            if (!value.test(props[k.key])) valid = false;
                        } else {
                            if (props[k.key] !== value) valid = false;
                        }
                    }
                });

                if (valid) {
                    if (!map.hasLayer()) map.addLayer(overlayMaps[overlay]);
                } else {
                    map.removeLayer(overlayMaps[overlay]);
                }


            }
        };

        __.countryChange = function(country) {
            selectedCountry = country;
            addOverlayControl();
        };

        __.onData = function(layers, eezs) {
            overlayMaps = {};
            markerList = [];

            // assign handlers and add to overlayMaps object
            setupOverlays(layers);
            setupPoints(eezs);

            // adds Points & Overlays to map as groups
            addOverlayControl();
        };

        return __;
    };

})(window);