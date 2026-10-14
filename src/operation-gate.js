// Lock synchronously, before React has rendered disabled buttons.
export function createOperationGate(){
 let pending=false;
 return async operation=>{
  if(pending)return false;
  pending=true;
  try{await operation();return true;}finally{pending=false;}
 };
}
