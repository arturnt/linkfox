/**
 * Get Email Button for LinkedIn
 * Disclamer: use this at your own risk, this was done as an academic exercise. Also, the code herein
 * is not my best work. I was optimizing for time when writing this. :)
 * @author arturnt
 */

var Utils = {

	getDomain: function(data) {
		var a = document.createElement('a');
		a.href = data;
		return a.hostname.replace(/www\./, "");
	},


	fixUrl: function(url) {

		if (!url) return url;

		// Sometimes jobs URLs have this wierdness..
		var brokenUrl = /http:\/\/https:\/\//;
		console.log('cleaning url', url, brokenUrl.test(url));
		if (brokenUrl.test(url)) {
			return url.replace(brokenUrl, "https://");
		}

		return url;
	},

	extractEmail: function(text) {
		return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
	},

	getParameterByName: function(url, name) {
		name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(url);
		return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	},

	cartesianProductOf: function() {
		return _.reduce(arguments, function(a, b) {
			return _.flatten(_.map(a, function(x) {
				return _.map(b, function(y) {
					return x.concat([y]);
				});
			}), true);
		}, [
			[]
		]);
	}

};

var EmailStrategies = {

	getEmailCombos: function(names, domains) {
		return _.uniq(_.map(Utils.cartesianProductOf(names, domains), function(pair) {
			return [pair[0], "@", pair[1]].join("").toLowerCase();
		}));
	},

	getWorkEmails: function(person, company) {
		if (!company || !company.domain) return [];
		var names = [];

		names.push(person.firstName.charAt(0) + person.lastName);
		if (company.maxSize <= 1000) {
			names.push(person.firstName);
			names.push(person.firstName + person.lastName.charAt(0));
		}
		names.push(person.firstName + "." + person.lastName);
		names.push(person.firstName + person.lastName);
		return _.uniq(EmailStrategies.getEmailCombos(names, [company.domain]));
	},

	getPersonalEmails: function(person, domains) {
		var domains = domains || ["gmail.com"];
		var names = [];

		if (person.username && (person.username !== person.firstName.toLowerCase() + person.lastName.toLowerCase())) {
			names.push(person.username);
		}

		if (person.twitterHandle) {
			names.push(person.twitterHandle);
		}

		names.push(person.firstName + "." + person.lastName);

		names.push(person.firstName.charAt(0) + person.lastName);

		names.push(person.lastName + "." + person.firstName);

		if ((person.firstName + person.lastName.charAt(0)).length > 5) {
			names.push(person.firstName + person.lastName.charAt(0));
		}

		if (person.middleName) {
			names.push(person.firstName.charAt(0) + person.middleName.charAt(0) + person.lastName);
		}

		var emails = EmailStrategies.getEmailCombos(names, domains);

		if (person.personalWebsite) {
			emails.unshift(person.firstName.toLowerCase() + "@" +
				Utils.getDomain(person.personalWebsite));
		}

		return _.uniq(emails);
	}
};

var Google = {

	paths: {
		result: ".g",
		title: "h3",
		link: "h3 a",
		desc: ".st"
	},

	rawSearch: function() {
		var query = _.compact(_.toArray(arguments)).join(" ");
		console.debug('searching with query', query);
		return $.get("https://www.google.com/search?q=" + encodeURIComponent(query));
	},

	search: function() {
		var defer = $.Deferred();

		Google.rawSearch.apply(this, arguments).then(function(content) {
			var result = [];

			$(content).find(Google.paths.result).each(function(index, el) {
				var title = $(el).find(Google.paths.title);
				var link = $(el).find(Google.paths.link);
				result.push({
					title: title.text(),
					href: link[0].getAttribute('data-href') || link[0].href,
					description: $(el).find(Google.paths.desc).text()
				});
			});

			defer.resolve(result);
		});

		return defer;
	}
};

var LinkedIn = {

	paths: {
		name: ".full-name",
		location: ".locality",
		headline: "#headline",
		link: ".public-profile dd span",
		jobs: ".background-experience .section-item",
		edu: ".background-education .section-item",
		twitter: "#twitter-view a",
		personalWebsite: "a:contains('Personal Website'), a:contains('Portfolio')",
		eduDate: ".education-date"
	},

	getPersonInfo: function() {

		var defer = $.Deferred();
		var jobs = LinkedIn.getJobs();
		var currentJob = jobs && jobs[0];

		var
			fullName = $(LinkedIn.paths.name).text(),
			headline = $(LinkedIn.paths.headline).text(),
			isFullName = !/\s[a-z]\./i.test(fullName),
			profileLink = $(LinkedIn.paths.link).text();

		if (!isFullName) {
			console.debug("this is a third degree connection, going to google to find the full name");
			Google.search(fullName, '"' + currentJob.company + '"', "site:linkedin.com").then(function(result) {
				var result = _.find(result, function(r) {
					return r.title.indexOf(fullName.slice(0, -1)) !== -1;
				});
				if (result) {
					fullName = result.title.replace(/\s-\s.*? \| LinkedIn/g,"").replace(" | LinkedIn", "").replace(" profiles", "");
					profileLink = result.href;
					isFullName = true;
					console.debug('searched google and found ', fullName, profileLink);
				}
			}).then(resolveName);
		} else {
			resolveName();
		}

		function resolveName() {

			var name = cleanName(fullName).split(" ");
			var usernamePattern = /.*?\.linkedin.com\/in\//;
			var firstJob = _.min(LinkedIn.getJobs(), 'startDate');
			var urlParts = usernamePattern.test(profileLink) ? null : profileLink.split("/");

			defer.resolve({
				firstName: _.first(name),
				lastName: _.last(name),
				middleName: null,
				maidenName: null,
				fullName: fullName,
				headline: headline,
				isFullName: isFullName,
				emails: extractEmails(),
				profileLink: profileLink,
				profileId: urlParts ? [urlParts.pop(), urlParts.pop(), urlParts.pop()].reverse().join("/") : null,
				personalWebsite: getWebsite($(LinkedIn.paths.personalWebsite).attr("href")),
				location: $(LinkedIn.paths.location).first().text(),
				twitterHandle: $(LinkedIn.paths.twitter).first().text() || null,
				username: usernamePattern.test(profileLink) ? profileLink.replace(usernamePattern, "") : null,
				age: firstJob && firstJob.startDate ? (new Date).getFullYear() - firstJob.startDate.getFullYear() + 21 : null
			});
		}

		function cleanName(name) {
			return name.replace(/, .*/, "") // anything with commas, phd, MD, etc. 
				.replace(/MD/, "")
				.replace(/\(.*?\)/, "") // remove all brackety stuff
				.replace(/[^a-zA-Z-\s]/g, '')
				.trim(); // now strip anything that's not a letter
		}

		function getWebsite(href) {
			return href ?
				Utils.getParameterByName("http://linkedin.com" + href, "url") : null;
		}

		function extractEmails() {
			return _(Utils.extractEmail($(".premium-profile, #profile").html()))
				.uniq()
				.map(function(e) {
					return {
						email: e,
						score: 1
					};
				}).value();
		}


		return defer.promise();
	},

	getJobs: function() {
		var jobs = [];

		$(LinkedIn.paths.jobs).each(function(i, job) {
			var $job = $(job);
			var times = $job.find("time");
			var start = $(times[0]).attr("datetime")
			var end = $(times[1]).attr("datetime")

			jobs.push({
				title: $job.find("header h4").text(),
				company: $job.find("header h5").text(),
				href: $job.find("[data-li-url]").data("li-url"),
				desc: $job.find(".description").text(),
				startDate: new Date(start),
				endDate: end ? new Date(end) : null
			});
		});

		return jobs;
	},

	getEducation: function() {
		var edu = [];

		$(LinkedIn.paths.jobs).each(function(i, job) {
			var $job = $(job);
			var times = $job.find("time");
			var start = $(times[0]).attr("datetime")
			var end = $(times[1]).attr("datetime")

			jobs.push({
				title: $job.find("h4").text(),
				company: $job.find("h5").text(),
				href: $job.find("[data-li-url]").data("li-url"),
				desc: $job.find(".description").text(),
				startDate: new Date(start),
				endDate: end ? new Date(end) : null
			});
		});

		return edu;
	},

	getCurrentJob: function() {
		return _.find(LinkedIn.getJobs(), function(job) {
			return job.href && !job.endDate;
		});
	},

	getCurrentCompanyInfo: function() {

		var defer = $.Deferred();
		var current = LinkedIn.getCurrentJob();

		console.debug('LinkedIn Job History', LinkedIn.getJobs());

		if (!current || !current.href) {
			console.warn("couldn't find a company");
			return;
		}

		console.debug('fetching ', current.href);

		$.get(current.href).then(function(content) {
			var company = {};
			var labels = $(content).find("th");
			var values = $(content).find("td");

			for (var i = 0; i < labels.length; i++) {
				var key = $(labels[i]).text();
				var value = $(values[i]).text();
				switch (key) {
					case "Co. Size:":
						var range = value.split(" ")[0].split("-")
						company.minSize = +range[0];
						company.maxSize = +range[1];
						break;
					case "Website:":
						company.website = Utils.fixUrl(Utils.getParameterByName($(values[i]).find('a').attr("href"), "url"));
						company.domain = Utils.getDomain(company.website);
						break;
					case "Industry:":
						company.industry = value;
						break;
				}
			}

			console.debug('returning company', company);

			defer.resolve(company);
		});

		return defer.promise();
	}
};

var FullContact = (function() {

	function get(email, person) {
		if (!email) {
			console.warn("email is not defined, exiting.");
			return;
		}

		return fetch(email, person);
	}

	function fetch(email, person, defer) {
		var defer = defer || $.Deferred();

		$.getJSON("https://api.fullcontact.com/v2/person.json?apiKey=&email=" + email)
			.always(function(profile) {
				if (profile && profile.status == 202) {
					setTimeout(_.bind(fetch, this, email, person, defer), 500);
					return;
				}
				if (profile) {
					defer.resolve({
						email: email,
						score: getScore(person, profile, email)
					});
				}
			});

		return defer;
	}

	function getScore(person, match, email) {
		var twitterMatch = _.any(match.socialProfiles, {
			type: "twitter",
			username: person.username
		});
		var linkedInMatch = _.any(match.socialProfiles, function(profile) {
			return profile.type === "linkedin" &&
				(profile.username == person.username || profile.url.indexOf(person.profileLink) !== -1);
		});

		if (twitterMatch || linkedInMatch) { // best match
			return 1.0;
		}

		var score = 0.0;


		if (match.contactInfo && match.contactInfo.familyName === person.lastName &&
			match.contactInfo.givenName === person.firstName) {
			console.log(match.contactInfo.familyName, person.lastName)
			score += 0.5;
		}

		if (email.indexOf(person.username + "@") === 0 && email.indexOf()) {
			score += 0.75
		}

		return score;
	}

	return {
		get: get
	}

})();

var Rapportive = (function() {

	var _statusDefer;
	var _status;

	function get(email, person) {

		if (!email) {
			console.warn("email is not defined, exiting.");
			return;
		}

		var defer = $.Deferred();

		if (!_statusDefer) {
			_statusDefer = fetchAuthToken();
		}

		_statusDefer.always(_.bind(fetchWithSession, this, email, person, defer));

		return defer.promise();
	}

	function fetchAuthToken() {

		var defer = $.Deferred();
		var item = localStorage.getItem("rapportive.status");

		if(item) {
			_status = JSON.parse(item);
			defer.resolve(_status);
		} else {
			$.getJSON("https://rapportive.com/login_status").done(function(status) {
				console.debug("setting status for rapportive: ", status);
				_status = status;
				defer.resolve(status);
				if(status.authenticated_as) 
					localStorage.setItem("rapportive.status", JSON.stringify(status));
			});
		}

		return defer;
	}

	function fetchWithSession(email, person, defer) {
		console.debug('fetching with email: ', email);

		if (!_status.authenticated_as) {
			console.warn("You are not logged into Rapportive and will be heavily throttled..");
		}

		if (!_status.session_token) {
			console.error("cannot make a request without an auth token!");
			return;
		}

		$.ajax({
			url: "https://profiles.rapportive.com/contacts/email/" + email,
			headers: {
				'X-Session-Token': _status.session_token
			},
			dataType: "json"
		}).always(function(profile) {
			if (profile && profile.contact) {
				defer.resolve({
					email: email,
					score: getScore(person, profile.contact)
				});
			} else {
				defer.resolve(null);
			}
		});
	}

	function getScore(person, match) {
		var twitterMatch = _.any(match.memberships, {
			site_name: "Twitter",
			username: person.twitterHandle || ""
		});
		var linkedInMatch = _.any(match.memberships, function(match) {
			return match.site_name === "LinkedIn" && 
				(person.username !== null && person.username === match.username ||
				 person.profileId === match.profile_id)
		});

		if (twitterMatch || linkedInMatch) { // best match
			return 1.0;
		}

		var score = 0.0;

		if (match.last_name === person.lastName &&
			person.firstName.indexOf(match.first_name) !== -1) {
			score += 0.5;
		}

		if (match.location === person.location) {
			score += 0.25;
		}

		return score;
	}

	function logout() {
		chrome.cookies.get({
			'url': 'https://rapportive.com/',
			'name': "rapportive_authk"
		}, function(cookies) {
			for (var i in cookies) {
				console.log("cookie", i, cookies[i]);
			}
		});
	}

	return {
		"get": get,
		"status": fetchAuthToken,
		"logout": logout
	}
})();


function getEmailTrigger() {

	// Disable the button
	$(this).addClass("disabled").off().hide();
	
	// Grab the person's info and current company info (for the domain off the page)

	LinkedIn.getPersonInfo().always(function(user) {
		console.debug("fetched user:", user);

		var allEmails = [];

		if (user && user.emails.length > 0) {
			return renderResults(user.emails || [], false);
		} else {
			renderResults();
		}

		getVerifiedEmails([LinkedIn.getPersonInfo()], EmailStrategies.getPersonalEmails).always(function(emails) {
			renderResults(allEmails = allEmails.concat(emails), false);
		});

		getVerifiedEmails([LinkedIn.getPersonInfo(),LinkedIn.getCurrentCompanyInfo()], EmailStrategies.getWorkEmails).always(function(emails) {
			renderResults(allEmails = allEmails.concat(emails), false);
		});
	});

	function getVerifiedEmails(required, strategy) {
		var defer = $.Deferred();
		$.when.apply(this, required).always(function(user) {
			var matches = strategy.apply(this, _.toArray(arguments));
			verifyEmails(user, matches, Rapportive).then(function(emails) {
				defer.resolve(emails);
			})
		});
		return defer.promise();
	}

	function verifyEmails(user, emails, Provider, matches, defer) {
		var defer = defer || $.Deferred(),
			email = emails.shift(),
			matches = matches || [];

		email ?
			Provider.get(email, user).always(resolveEmail) :
			defer.resolve(matches);

		function resolveEmail(result) {
			console.log(result);
			if (result === null) {
				console.error("result failed to return..");
			} else if (result.score == 1) {
				return defer.resolve([result].concat(matches));
			} else if (result.score > 0) {
				matches.push(result);
			} else {
				console.debug('[failed]', result);
			}
			verifyEmails(user, emails, Provider, matches, defer);
		}

		return defer.promise();
	}

};

function renderResults(emails, loading) {
	$.get(chrome.extension.getURL('templates/emails.htm')).always(function(data) {
		var $result = $("#email-result"),
			rendered = _.template(data, {
				'emails': emails,
				'loading': _.isUndefined(loading) ? true : loading
			});

		$result.length > 0 ?
			$result.html(rendered) :
			$(rendered).insertAfter(".profile-card");
	});
}

function insertEmailButton() {
	$('<a href="javascript:void(0)" class="orange button-secondary">Be Foxy</a>')
		.insertBefore($('.profile-actions a').first())
		.click(getEmailTrigger);
}

function insertNameButton() {
	$(".see-full-name").html("( <a href='javascript:void(0)'>Foxy that name</a> )").click(function() {
		LinkedIn.getPersonInfo().then(function(person) {
			$(LinkedIn.paths.name).text(person.fullName);
			$(".see-full-name").remove();
		});
	});
}


insertEmailButton();
insertNameButton();