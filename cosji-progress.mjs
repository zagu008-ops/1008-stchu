// Scope cleanup to this request, so concurrent tasks and error notifications remain visible.
export async function withProgressToast(toasts,message,work){
    const toast=toasts.info(message,'',{timeOut:0,extendedTimeOut:0});
    try{return await work();}
    finally{if(toast)toasts.remove(toast);}
}
