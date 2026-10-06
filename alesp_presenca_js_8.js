//Jquery functions
$(document).ready(function() {
	// hover Menu topo
	$('li.nav-item').hover(function() {
		$(this).find('.dropdown-menu').stop(true, true).delay(10).fadeIn(200);
	}, function() {
		$(this).find('.dropdown-menu').stop(true, true).delay(100).fadeOut(10);
	});

	//Se a tela for 1200px ou mais
	if (window.innerWidth > 1199) {
		// links do Menu titulo
		$('li.nav-item a').removeAttr("data-bs-toggle");
		removeDoisSlides();
	}
	iniciaCalendarios();

	$('#dataAgenda').html(dataHoje("dd/mm/yyyy"));	
	$('#agendaCarousel.carousel .carousel-inner .carousel-item:first-child').addClass('active');

	// Tweak to allow input focusing though access key
	$("#access-search-link").click(function () {
		$("#query_desktop").focus();
	});
});


//Remove dois slides da vers�o desktop e retorna estes dois na vers�o mobile
function removeDoisSlides() {
	if (window.innerWidth > 1199) {  //Remove duas not�cias do carousel home
		$('#foto .carousel-inner .portableOnly').removeClass('carousel-item');
		$('#foto .carousel-inner div').removeClass('active');
		$('#foto .carousel-inner .carousel-item:first-child').addClass('active');
	} else {	//Retorna as not�cias para a vers�o mobile
		$('#foto .carousel-inner .portableOnly').addClass('carousel-item');
	}
}

//Trigger quando a tela for redimensionada
$(window).resize(function() {
	removeDoisSlides();
});

$(".btn-wpp").click(function(e) {
	e.preventDefault();
	$("#wppshare").attr("href", "https://api.whatsapp.com/send?text=" + window.location);
	var urlDestino = $(this).attr("href");
	window.open(urlDestino, "", "width=500,height=500,resizable=yes");
});

function iniciaCalendarios(){
	if (!$.datepicker) {
		return;
	}

	/* Brazilian initialisation for the jQuery UI date picker plugin. */
	/* Written by Leonildo Costa Silva (leocsilva@gmail.com). */
	$.datepicker.regional['pt-BR'] = {
		closeText: 'Fechar',
		prevText: '&#x3c;Anterior',
		nextText: 'Pr&oacute;ximo&#x3e;',
		currentText: 'Hoje',
		monthNames: ['Janeiro', 'Fevereiro', 'Mar&ccedil;o', 'Abril', 'Maio', 'Junho',
			'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
		monthNamesShort: ['Janeiro', 'Fevereiro', 'Mar&ccedil;o', 'Abril', 'Maio', 'Junho',
			'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
		dayNames: ['Domingo', 'Segunda-feira', 'Ter&ccedil;a-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'],
		dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
		dayNamesMin: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
		weekHeader: 'Sm',
		dateFormat: 'dd/mm/yy',
		firstDay: 0,
		isRTL: false,
		showMonthAfterYear: false,
		yearSuffix: ''
	};
	$.datepicker.setDefaults($.datepicker.regional['pt-BR']);

	var $datepickers = $(".datepicker");
	if (!$datepickers.length) {
		return;
	}
	$datepickers.datepicker({
		changeMonth: true,
		changeYear: true
	});
	$datepickers.attr('autocomplete', 'off');

}

//Not�cias Instantaneas 07/2020
function noticiasInstantaneas() {
	var noticiasInstantaneas = $('#row-noticias');
	var intantaneas = "/dinamico/homepage/conteudo/row1.jsp";
	//$('#noticias a, #noticias div').delay("1000").fadeOut("slow");	
	//$('#noticias a, #noticias div').fadeIn();	
	noticiasInstantaneas.load(intantaneas);

	var now = new Date(Date.now());
	var instante = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();

	//console.log("Ultima atualizacao de noticias "+ instante);
}

/* Bot�o Back to top */
// Scrolls down, exibe o bot�o
window.onscroll = function () {
	if (document.body.scrollTop > 30 ||	document.documentElement.scrollTop > 30) {
		document.getElementById("btn-back-to-top").style.display = "block";
	} else {
		document.getElementById("btn-back-to-top").style.display = "none";
	}
};
function voltarAoTopo() {
	window.scrollTo(0, 0);
}
/* Fim - Bot�o back to top */


function dataHoje(tipo) {
	var now = new Date(Date.now());

	var dia = now.getDate();
	var mes = now.getMonth();
	var ano = now.getFullYear();
	var Dia = now.getDay();
	var Mes = now.getUTCMonth();

	if (dia < 10)
		dia = "0" + dia
	if (mes < 10)
		mes = "0" + mes

	arrayDia = new Array();
	arrayDia[0] = "Domingo";
	arrayDia[1] = "Segunda-Feira";
	arrayDia[2] = "Ter�a-Feira";
	arrayDia[3] = "Quarta-Feira";
	arrayDia[4] = "Quinta-Feira";
	arrayDia[5] = "Sexta-Feira";
	arrayDia[6] = "S�bado";

	var arrayMes = new Array();
	arrayMes[0] = "01";
	arrayMes[1] = "02";
	arrayMes[2] = "03";
	arrayMes[3] = "04";
	arrayMes[4] = "05";
	arrayMes[5] = "06";
	arrayMes[6] = "07";
	arrayMes[7] = "08";
	arrayMes[8] = "09";
	arrayMes[9] = "10";
	arrayMes[10] = "11";
	arrayMes[11] = "12";

	var arrayMesExtenso = new Array();
	arrayMesExtenso[0] = "Janeiro";
	arrayMesExtenso[1] = "Fevereiro";
	arrayMesExtenso[2] = "Mar�o";
	arrayMesExtenso[3] = "Abril";
	arrayMesExtenso[4] = "Maio";
	arrayMesExtenso[5] = "Junho";
	arrayMesExtenso[6] = "Julho";
	arrayMesExtenso[7] = "Agosto";
	arrayMesExtenso[8] = "Setembro";
	arrayMesExtenso[9] = "Outubro";
	arrayMesExtenso[10] = "Novembro";
	arrayMesExtenso[11] = "Dezembro";

	if (tipo == "dd/mm/yyyy") {
		dataHoje = arrayDia[Dia] + " " + dia + "/" + arrayMes[Mes] + "/" + ano;
	}

	//	document.getElementById("dataPorExtenso").innerHTML = dataHoje;	
	return dataHoje;
}

function submeterBuscaGeral(origem) {
	var query_encode = encodeURI(document.getElementById('query_' + origem).value);
	document.getElementById('q_' + origem).value = query_encode;
}

function submeterLegislacao() {

	document.formLegislacao.buscaLivreEscape.value = escape(document.formLegislacao.buscaLivreEscape.value);
	document.formLegislacao.submit();
}

function submeterProjetos() {

	document.formProjetos.text.value = encodeURI(document.formProjetos.text.value);
	document.formProjetos.submit();
	document.formProjetos.text.value = decodeURI(document.formProjetos.text.value);
}

function paginaProjetos() {

	document.formProjetos.method.value = 'inicio';
	document.formProjetos.submit();
}

function retiraAcentos(str) {
	com_acento = "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ";
	sem_acento = "AAAAAAACEEEEIIIIDNOOOOOOUUUUYsBaaaaaaaceeeeiiiionoooooouuuuyby";

	novastr = "";
	for (i = 0; i < str.length; i++) {
		troca = false;
		for (a = 0; a < com_acento.length; a++) {
			if (str.substr(i, 1) == com_acento.substr(a, 1)) {
				novastr += sem_acento.substr(a, 1);
				troca = true;
				break;
			}
		}
		if (troca == false) {
			novastr += str.substr(i, 1);
		}
	}

	return novastr;
} 	