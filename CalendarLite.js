define([
	"dojo",
	".",
	"dojo/text!./templates/Calendar.html",
	"dojo/string",
	"dojo/cldr/supplemental",
	"dojo/date",
	"dojo/date/locale",
	"./_WidgetBase",
	"./_TemplatedMixin"], function(dojo, dijit){

	// module:
	//		dijit/CalendarLite
	// summary:
	//		Lightweight version of Calendar widget aimed towards mobile use

	dojo.declare("dijit.CalendarLite", [dijit._WidgetBase, dijit._TemplatedMixin], {
		// summary:
		//		Lightweight version of Calendar widget aimed towards mobile use
		//
		// description:
		//		A simple GUI for choosing a date in the context of a monthly calendar.
		//		This widget can't be used in a form because it doesn't serialize the date to an
		//		`<input>` field.  For a form element, use dijit.form.DateTextBox instead.
		//
		//		Note that the parser takes all dates attributes passed in the
		//		[RFC 3339 format](http://www.faqs.org/rfcs/rfc3339.html), e.g. `2005-06-30T08:05:00-07:00`
		//		so that they are serializable and locale-independent.
		//
		//		Also note that this widget isn't keyboard accessible; use dijit.Calendar for that
		// example:
		//	|	var calendar = new dijit.CalendarLite({}, dojo.byId("calendarNode"));
		//
		// example:
		//	|	<div data-dojo-type="dijit.CalendarLite"></div>

		// Template for main calendar
		templateString: dojo.cache("dijit", "templates/Calendar.html"),

		// Template for cell for a day of the week (ex: M)
		dowTemplateString: '<th class="dijitReset dijitCalendarDayLabelTemplate" role="columnheader"><span class="dijitCalendarDayLabel">${d}</span></th>',

		// Templates for a single date (ex: 13), and for a row for a week (ex: 20 21 22 23 24 25 26)
		dateTemplateString: '<td class="dijitReset" role="gridcell" dojoAttachPoint="dateCells"><span class="dijitCalendarDateLabel" dojoAttachPoint="dateLabels"></span></td>',
		weekTemplateString: '<tr class="dijitReset dijitCalendarWeekTemplate" role="row">${d}${d}${d}${d}${d}${d}${d}</tr>',

		// value: Date
		//		The currently selected Date, initially set to invalid date to indicate no selection.
		value: new Date(""),
		// TODO: for 2.0 make this a string (ISO format) rather than a Date

		// datePackage: String
		//		JavaScript namespace to find Calendar routines.  Uses Gregorian Calendar routines
		//		at dojo.date by default.
		datePackage: "dojo.date",

		// dayWidth: String
		//		How to represent the days of the week in the calendar header. See dojo.date.locale
		dayWidth: "narrow",

		// tabIndex: Integer
		//		Order fields are traversed when user hits the tab key
		tabIndex: "0",

		// currentFocus: Date
		//		Date object containing the currently focused date, or the date which would be focused
		//		if the calendar itself was focused.   Also indicates which year and month to display,
		//		i.e. the current "page" the calendar is on.
		currentFocus: new Date(),

		baseClass:"dijitCalendar",

		_isValidDate: function(/*Date*/ value){
			// summary:
			//		Runs various tests on the value, checking that it's a valid date, rather
			//		than blank or NaN.
			// tags:
			//		private
			return value && !isNaN(value) && typeof value == "object" &&
				value.toString() != this.constructor.prototype.value.toString();
		},

		_getValueAttr: function(){
			// summary:
			//		Support get('value')

			// this.value is set to 1AM, but return midnight, local time for back-compat
			var value = new this.dateClassObj(this.value);
			value.setHours(0, 0, 0, 0);

			// If daylight savings pushes midnight to the previous date, fix the Date
			// object to point at 1am so it will represent the correct day. See #9366
			if(value.getDate() < this.value.getDate()){
				value = this.dateFuncObj.add(value, "hour", 1);
			}
			return value;
		},

		_setValueAttr: function(/*Date|Number*/ value, /*Boolean*/ priorityChange){
			// summary:
			//		Support set("value", ...)
			// description:
			// 		Set the current date and update the UI.  If the date is disabled, the value will
			//		not change, but the display will change to the corresponding month.
			// value:
			//		Either a Date or the number of seconds since 1970.
			// tags:
			//      protected
			if(value){
				// convert from Number to Date, or make copy of Date object so that setHours() call below
				// doesn't affect original value
				value = new this.dateClassObj(value);
			}
			if(this._isValidDate(value)){
				if(!this._isValidDate(this.value) || this.dateFuncObj.compare(value, this.value)){
					value.setHours(1, 0, 0, 0); // round to nearest day (1am to avoid issues when DST shift occurs at midnight, see #8521, #9366)

					if(!this.isDisabledDate(value, this.lang)){
						this._set("value", value);

						// Set focus cell to the new value.   Arguably this should only happen when there isn't a current
						// focus point.   This will also repopulate the grid, showing the new selected value (and possibly
						// new month/year).
						this.set("currentFocus", value);

						if(priorityChange || typeof priorityChange == "undefined"){
							this.onChange(this.get('value'));
						}
					}
				}
			}else{
				// clear value, and repopulate grid (to deselect the previously selected day) without changing currentFocus
				this._set("value", null);
				this.set("currentFocus", this.currentFocus);
			}
		},

		_setText: function(node, text){
			// summary:
			//		This just sets the content of node to the specified text.
			//		Can't do "node.innerHTML=text" because of an IE bug w/tables, see #3434.
			// tags:
			//      private
			while(node.firstChild){
				node.removeChild(node.firstChild);
			}
			node.appendChild(dojo.doc.createTextNode(text));
		},

		_populateGrid: function(){
			// summary:
			//      Fills in the calendar grid with each day (1-31)
			// tags:
			//      private

			var month = new this.dateClassObj(this.currentFocus);
			month.setDate(1);

			var firstDay = month.getDay(),
				daysInMonth = this.dateFuncObj.getDaysInMonth(month),
				daysInPreviousMonth = this.dateFuncObj.getDaysInMonth(this.dateFuncObj.add(month, "month", -1)),
				today = new this.dateClassObj(),
				dayOffset = dojo.cldr.supplemental.getFirstDayOfWeek(this.lang);
			if(dayOffset > firstDay){ dayOffset -= 7; }

			// Mapping from date (as specified by number returned from Date.valueOf()) to corresponding <td>
			this._date2cell = {};

			// Iterate through dates in the calendar and fill in date numbers and style info
			dojo.forEach(this.dateCells, function(template, idx){
				var i = idx + dayOffset;
				var date = new this.dateClassObj(month),
					number, clazz = "dijitCalendar", adj = 0;

				if(i < firstDay){
					number = daysInPreviousMonth - firstDay + i + 1;
					adj = -1;
					clazz += "Previous";
				}else if(i >= (firstDay + daysInMonth)){
					number = i - firstDay - daysInMonth + 1;
					adj = 1;
					clazz += "Next";
				}else{
					number = i - firstDay + 1;
					clazz += "Current";
				}

				if(adj){
					date = this.dateFuncObj.add(date, "month", adj);
				}
				date.setDate(number);

				if(!this.dateFuncObj.compare(date, today, "date")){
					clazz = "dijitCalendarCurrentDate " + clazz;
				}

				if(this._isSelectedDate(date, this.lang)){
					clazz = "dijitCalendarSelectedDate " + clazz;
				}

				if(this.isDisabledDate(date, this.lang)){
					clazz = "dijitCalendarDisabledDate " + clazz;
				}

				var clazz2 = this.getClassForDate(date, this.lang);
				if(clazz2){
					clazz = clazz2 + " " + clazz;
				}

				template.className = clazz + "Month dijitCalendarDateTemplate";

				// Each cell has an associated integer value representing it's date
				var dateVal = date.valueOf();
				this._date2cell[dateVal] = template;
				template.dijitDateValue = dateVal;

				// Set Date string (ex: "13").
				this._setText(this.dateLabels[idx], date.getDateLocalized ? date.getDateLocalized(this.lang) : date.getDate());
			}, this);

			// set name of this month
			this.monthWidget.set("month", month);

			// Fill in localized prev/current/next years
			var y = month.getFullYear() - 1;
			var d = new this.dateClassObj();
			dojo.forEach(["previous", "current", "next"], function(name){
				d.setFullYear(y++);
				this._setText(this[name+"YearLabelNode"],
					this.dateLocaleModule.format(d, {selector:'year', locale:this.lang}));
			}, this);
		},

		goToToday: function(){
			// summary:
			//      Sets calendar's value to today's date
			this.set('value', new this.dateClassObj());
		},

		constructor: function(/*Object*/args){
			var dateClass = (args.datePackage && (args.datePackage != "dojo.date"))? args.datePackage + ".Date" : "Date";
			this.dateClassObj = dojo.getObject(dateClass, false);
			this.datePackage = args.datePackage || this.datePackage;
			this.dateFuncObj = dojo.getObject(this.datePackage, false);
			this.dateLocaleModule = dojo.getObject(this.datePackage + ".locale", false);
		},

		_createMonthWidget: function(){
			// summary:
			//		Creates the drop down button that displays the current month and lets user pick a new one

			return dijit.CalendarLite._MonthWidget({
				id: this.id + "_mw",
				lang: this.lang,
				dateLocaleModule: this.dateLocaleModule
			}, this.monthNode);
		},

		buildRendering: function(){
			// Markup for days of the week (referenced from template)
			var d = this.dowTemplateString,
				dayNames = this.dateLocaleModule.getNames('days', this.dayWidth, 'standAlone', this.lang),
				dayOffset = dojo.cldr.supplemental.getFirstDayOfWeek(this.lang);
			this.dayCellsHtml = dojo.string.substitute([d,d,d,d,d,d,d].join(""), {d: ""}, function(val, key){
				return dayNames[dayOffset++ % 7]
			});

			// Markup for dates of the month (referenced from template), but without numbers filled in
			var r = dojo.string.substitute(this.weekTemplateString, {d: this.dateTemplateString});
			this.dateRowsHtml = [r,r,r,r,r,r].join("");

			// Instantiate from template.
			// dateCells and dateLabels arrays filled when _Templated parses my template.
			this.dateCells = [];
			this.dateLabels = [];
			this.inherited(arguments);

			dojo.setSelectable(this.domNode, false);

			var dateObj = new this.dateClassObj(this.currentFocus);

			this._supportingWidgets.push(this.monthWidget = this._createMonthWidget());

			this.set('currentFocus', dateObj, false);	// draw the grid to the month specified by currentFocus

			// Set up connects for increment/decrement of months/years
			var connect = dojo.hitch(this, function(nodeProp, part, amount){
				this.connect(this[nodeProp], "onclick", function(evt){
					this._setCurrentFocusAttr(this.dateFuncObj.add(this.currentFocus, part, amount));
				});
			});
			connect("incrementMonth", "month", 1);
			connect("decrementMonth", "month", -1);
			connect("nextYearLabelNode", "year", 1);
			connect("previousYearLabelNode", "year", -1);
		},

		_setCurrentFocusAttr: function(/*Date*/ date, /*Boolean*/ forceFocus){
			// summary:
			//		If the calendar currently has focus, then focuses specified date,
			//		changing the currently displayed month/year if necessary.
			//		If the calendar doesn't have focus, updates currently
			//		displayed month/year, and sets the cell that will get focus.
			// forceFocus:
			//		If true, will focus() the cell even if calendar itself doesn't have focus

			var oldFocus = this.currentFocus,
				oldCell = oldFocus && this._date2cell ? this._date2cell[oldFocus.valueOf()] : null;

			// round specified value to nearest day (1am to avoid issues when DST shift occurs at midnight, see #8521, #9366)
			date = new this.dateClassObj(date);
			date.setHours(1, 0, 0, 0);

			this._set("currentFocus", date);

			// TODO: only re-populate grid when month/year has changed
			this._populateGrid();

			// set tabIndex=0 on new cell, and focus it (but only if Calendar itself is focused)
			var newCell = this._date2cell[date.valueOf()];
			newCell.setAttribute("tabIndex", this.tabIndex);
			if(this.focused || forceFocus){
				newCell.focus();
			}

			// set tabIndex=-1 on old focusable cell
			if(oldCell && oldCell != newCell){
				if(dojo.isWebKit){	// see #11064 about webkit bug
					oldCell.setAttribute("tabIndex", "-1");
				}else{
					oldCell.removeAttribute("tabIndex");
				}
			}
		},

		focus: function(){
			// summary:
			//		Focus the calendar by focusing one of the calendar cells
			this._setCurrentFocusAttr(this.currentFocus, true);
		},

		_onMonthSelect: function(/*Number*/ newMonth){
			// summary:
			//      Handler for when user selects a month from the drop down list
			// tags:
			//      protected

			// move to selected month, bounding by the number of days in the month
			// (ex: dec 31 --> jan 28, not jan 31)
			this.currentFocus = this.dateFuncObj.add(this.currentFocus, "month",
				newMonth - this.currentFocus.getMonth());
			this._populateGrid();
		},

		_onDayClick: function(/*Event*/ evt){
			// summary:
			//      Handler for day clicks, selects the date if appropriate
			// tags:
			//      protected
			dojo.stopEvent(evt);
			for(var node = evt.target; node && !node.dijitDateValue; node = node.parentNode);
			if(node && !dojo.hasClass(node, "dijitCalendarDisabledDate")){
				this.set('value', node.dijitDateValue);
			}
		},

		onChange: function(/*Date*/ date){
			// summary:
			//		Called only when the selected date has changed
		},

		_isSelectedDate: function(/*Date*/ dateObject, /*String?*/ locale){
			// summary:
			//		Extension point so developers can subclass Calendar to
			//		support multiple (concurrently) selected dates
			// tags:
			//		protected extension
			return this._isValidDate(this.value) && !this.dateFuncObj.compare(dateObject, this.value, "date")
		},

		isDisabledDate: function(/*Date*/ dateObject, /*String?*/ locale){
			// summary:
			//		May be overridden to disable certain dates in the calendar e.g. `isDisabledDate=dojo.date.locale.isWeekend`
			// tags:
			//      extension
/*=====
			return false; // Boolean
=====*/
		},

		getClassForDate: function(/*Date*/ dateObject, /*String?*/ locale){
			// summary:
			//		May be overridden to return CSS classes to associate with the date entry for the given dateObject,
			//		for example to indicate a holiday in specified locale.
			// tags:
			//      extension

/*=====
			return ""; // String
=====*/
		}
	});

	dojo.declare("dijit.CalendarLite._MonthWidget", dijit._WidgetBase, {
		// summary:
		//		Displays name of current month padded to the width of the month
		//		w/the longest name, so that changing months doesn't change width.
		//
		//		Create as new dijit.Calendar._MonthWidget({
		//			lang: ...,
		//			dateLocaleModule: ...
		//		})

		_setMonthAttr: function(month){
			// summary:
			//		Set the current month to display as a label
			var monthNames = this.dateLocaleModule.getNames('months', 'wide', 'standAlone', this.lang, month),
				spacer =
					(dojo.isIE == 6 ? "" :	"<div class='dijitSpacer'>" +
						dojo.map(monthNames, function(s){ return "<div>" + s + "</div>"; }).join("") + "</div>");

			// Set name of current month and also fill in spacer element with all the month names
			// (invisible) so that the maximum width will affect layout.   But not on IE6 because then
			// the center <TH> overlaps the right <TH> (due to a browser bug).
			this.domNode.innerHTML =
				spacer +
				"<div class='dijitCalendarMonthLabel dijitCalendarCurrentMonthLabel'>" +
				monthNames[month.getMonth()] + "</div>";
		}
	});

	return dijit.CalendarLite;
});
