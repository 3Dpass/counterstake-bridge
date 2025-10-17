/*jslint node: true */
'use strict';
const conf = require('ocore/conf.js');
const mail = require('ocore/mail.js');

function notifyAdmin(subject, body) {
	console.log('notifyAdmin:\n' + subject + '\n' + body);
	
	// Check if email notifications are disabled
	if (conf.disable_email_notifications) {
		console.log('Email notifications disabled - skipping email send');
		return;
	}
	
	mail.sendmail({
		to: conf.admin_email,
		from: conf.from_email,
		subject: subject,
		body: body || subject,
	});
}

exports.notifyAdmin = notifyAdmin;